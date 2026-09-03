function readPackage(pkg) {
  if (pkg.name === 'esbuild') {
    pkg.scripts = pkg.scripts || {};
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};