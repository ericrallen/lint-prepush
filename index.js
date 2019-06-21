#!/usr/bin/env node

if (process.stdout.isTTY) {
  process.env.FORCE_COLOR = "1";
}

(function() {
  const Listr = require("listr");
  const chalk = require("chalk");
  const debug = require("debug")("lint-prepush:index");
  const os = require('os');
  const Cache = require("file-system-cache").default;

  const cache = Cache({
    basePath: `${os.homedir()}/.lint-prepush`, //Path where cache files are stored.
    ns: process.cwd() //A grouping namespace for items.
  });

  const { log } = console;

  const { loadConfig, execChildProcess } = require("./utils/common");
  const resolveMainTask = require("./utils/resolveMainTask");
  const fetchGitDiff = require("./utils/fetchGitDiff");

  let theme = {
    success: "green",
    error: "red",
    warning: "orange"
  };

  loadConfig()
    .then(({ config = {} } = {}) => {

      let {
        base : baseBranch = 'master',
        tasks = {},
        theme: userTheme = {},
      } = config;

      theme = Object.assign(theme, userTheme);

      const success = chalk.keyword(theme.success);
      const error = chalk.keyword(theme.error);
      const warning = chalk.keyword(theme.warning);

      debug('Base Branch:' + baseBranch);

      // Skip linter for base branch
      let getCurrentBranchCommand = 'git rev-parse --abbrev-ref HEAD';
      execChildProcess({ command: getCurrentBranchCommand })
        .then(currentBranch => {

          debug('Current Branch:' + currentBranch);

          if(currentBranch === baseBranch) {
            log(warning("\nNOTE: Skipping checks since you are in the base branch\n"));
            return;
          }

          execChildProcess({ command: 'git rev-parse HEAD' })
            .then((commitHash = '') => {
              debug('Curret Commit Hash:' + commitHash);

              let cachedCommitHash = cache.getSync("linted-hash") || "";
              debug('Cached Commit Hash:' + cachedCommitHash);

              if(commitHash === cachedCommitHash) {
                log(warning("\nNOTE: Skipping checks since the commit(s) have been linted already.\n"));
                return;
              }

              // Fetching committed git files
              fetchGitDiff( baseBranch ).then((committedGitFiles = []) => {
                debug(committedGitFiles);
                new Listr(resolveMainTask({ tasks, committedGitFiles }), {
                  exitOnError: false,
                  concurrent: true,
                  collapse: false
                })
                  .run()
                  .then(() => {
                    cache.setSync("linted-hash", commitHash);
                    debug('Cached Current Commit Hash');
                    log(success("\nVoila! 🎉  Code is ready to be Shipped.\n"));
                  })
                  .catch(({ errors }) => {
                    process.exitCode = 1;
                    errors.forEach(err => {
                      console.error(err.customErrorMessage);
                    });
                  });
              })
              .catch((message = '') => {
                process.exitCode = 1;
                log(warning(message));
              });
            });
        })
        .catch(() => {
          log(error('\nCould not get the current Branch.\n'));
          process.exitCode = 1;
          return;
        });
    })

    .catch(() => {
      const error = chalk.keyword(theme.error);

      process.exitCode = 1;

      log(error("\nLoading Configuration⚙️ Failed!😑\n"));
    });
})();
