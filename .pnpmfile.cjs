module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'esbuild') {
        pkg.pnpm = pkg.pnpm || {};
        pkg.pnpm.allowBuild = true;
      }
      return pkg;
    }
  }
}