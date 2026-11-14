// configure-pages metadata also handles custom domains and user/org sites.
export function pagesBase(env: Record<string, string | undefined>): string {
  const override = env.PAGES_BASE_PATH;
  if (override !== undefined) {
    if (
      !override.startsWith("/") ||
      override.includes("..") ||
      /[?#\\]/.test(override)
    ) {
      throw new Error(
        "PAGES_BASE_PATH must be an absolute URL path, e.g. /my-repo/ or /.",
      );
    }
    return override.endsWith("/") ? override : `${override}/`;
  }
  if (env.GITHUB_ACTIONS === "true" && env.GITHUB_REPOSITORY) {
    const [owner, repo] = env.GITHUB_REPOSITORY.split("/");
    return repo.toLowerCase() === `${owner}.github.io`.toLowerCase()
      ? "/"
      : `/${repo}/`;
  }
  return "/";
}
