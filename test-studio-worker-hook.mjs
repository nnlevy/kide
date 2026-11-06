// Test-only resolver so node can load the Worker's extensionless TypeScript import.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "./seo-generated" || specifier.endsWith("/seo-generated")) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
