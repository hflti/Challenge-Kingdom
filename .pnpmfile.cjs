module.exports = {
  hooks: {
    readPackageJson(pkg) {
      if (pkg.name === 'esbuild') {
        pkg.scripts = pkg.scripts || {};
      }
      return pkg;
    }
  }
}