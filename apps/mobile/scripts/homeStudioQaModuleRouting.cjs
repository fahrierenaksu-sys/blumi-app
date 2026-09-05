const path = require("node:path")

function isHomeStudioQaBuild({ rawQaFlag, buildProfile }) {
  return (
    rawQaFlag === "1" &&
    (buildProfile === "development" || buildProfile === "native-ui-test")
  )
}

function resolveHomeStudioQaModulePath({ projectRoot, rawQaFlag, buildProfile }) {
  const qaBuild = isHomeStudioQaBuild({ rawQaFlag, buildProfile })

  return path.resolve(
    projectRoot,
    qaBuild
      ? "src/screens/HomeStudioScreen.tsx"
      : "src/features/roomStudio/homeStudioQaStub.tsx"
  )
}

function resolveHomeStudioQaModuleDirectory({ projectRoot, rawQaFlag, buildProfile }) {
  const qaBuild = isHomeStudioQaBuild({ rawQaFlag, buildProfile })

  return path.resolve(
    projectRoot,
    qaBuild
      ? "src/features/roomStudio/homeStudioQaLiveModule"
      : "src/features/roomStudio/homeStudioQaStubModule"
  )
}

module.exports = {
  resolveHomeStudioQaModuleDirectory,
  resolveHomeStudioQaModulePath
}
