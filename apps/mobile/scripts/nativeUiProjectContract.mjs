/** Fail before touching a simulator when a shared scheme names a missing UI test target. */
export function assertNativeUiTestTarget(schemeXml, projectFile) {
  const testReferences = [...schemeXml.matchAll(/<TestableReference\b[\s\S]*?<\/TestableReference>/g)]
  const nativeTargets = projectFile.match(/\/\* Begin PBXNativeTarget section \*\/([\s\S]*?)\/\* End PBXNativeTarget section \*\//)?.[1] ?? ""

  if (testReferences.length === 0) {
    throw new Error("Native UI scheme has no testable target.")
  }

  for (const [reference] of testReferences) {
    const buildable = reference.match(/<BuildableReference\b([\s\S]*?)\/>/)?.[1] ?? ""
    const targetId = buildable.match(/BlueprintIdentifier\s*=\s*"([A-F0-9]{24})"/)?.[1]
    if (!targetId) continue
    const target = nativeTargets.match(new RegExp(`(?:^|\\n)\\s*${targetId}\\s*/\\*[^\\n]*\\*/\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};`))?.[1]
    if (target?.includes('productType = "com.apple.product-type.bundle.ui-testing";')) {
      return
    }
  }

  throw new Error("Native UI scheme references no existing XCUITest target in the Xcode project.")
}
