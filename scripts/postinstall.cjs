// Root postinstall: apply patches/ (patch-package).
//
// A workspace-scoped install (CI's `npm ci` inside apps/web) still runs this
// root hook but installs neither patch-package nor metro, the only patched
// package, so there is nothing to apply. A full install has both, and a failed
// patch still fails the install.
const { execSync } = require('node:child_process')

try {
  require.resolve('patch-package/package.json')
} catch {
  process.exit(0)
}
execSync('patch-package', { stdio: 'inherit' })
