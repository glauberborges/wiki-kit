import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
// GitHub Actions and Jenkins each get a ready-made template; every other CI
// (GitLab, Bitbucket, Drone, ...) has no file to copy, so the caller falls
// back to printing manual shell commands — see SKILL.md's "Instale o
// esqueleto" table.
export function selectCi(repoRoot) {
    if (isDirectory(join(repoRoot, ".github")))
        return "github";
    if (isFile(join(repoRoot, "Jenkinsfile")))
        return "jenkins";
    return "manual";
}
function isDirectory(path) {
    return existsSync(path) && statSync(path).isDirectory();
}
function isFile(path) {
    return existsSync(path) && statSync(path).isFile();
}
