import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import crypto from "node:crypto";
export class LocalFileStrategy {
    type = "local";
    async fetch(source, lastSync) {
        const targetPath = source.uri;
        const docs = [];
        if (!fs.existsSync(targetPath)) {
            console.warn(`[LocalFileStrategy] Path does not exist: ${targetPath}`);
            return [];
        }
        try {
            const stats = fs.statSync(targetPath);
            if (stats.isFile()) {
                const ext = path.extname(targetPath).toLowerCase();
                if ([".md", ".markdown", ".txt"].includes(ext)) {
                    const doc = this.readFileAsDocument(targetPath, source.id, stats);
                    if (doc)
                        docs.push(doc);
                }
            }
            else if (stats.isDirectory()) {
                // Find all matching files in directory tree
                const pattern = "**/*.{md,markdown,txt}";
                const normalizedTarget = targetPath.replace(/\\/g, "/");
                const files = await fg(pattern, {
                    cwd: normalizedTarget,
                    absolute: true,
                    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
                    onlyFiles: true,
                });
                for (const filePath of files) {
                    const fileStat = fs.statSync(filePath);
                    const doc = this.readFileAsDocument(filePath, source.id, fileStat);
                    if (doc)
                        docs.push(doc);
                }
            }
        }
        catch (err) {
            console.warn(`[LocalFileStrategy] Error reading local path ${targetPath}:`, err.message);
            return [];
        }
        return docs;
    }
    readFileAsDocument(filePath, sourceId, stats) {
        try {
            const content = fs.readFileSync(filePath, "utf8");
            const title = this.extractTitle(content, filePath);
            const normalizedPath = filePath.replace(/\\/g, "/");
            return {
                id: crypto.randomUUID(),
                sourceId,
                title,
                rawContent: content,
                originUrl: `file://${normalizedPath}`,
                publishedAt: stats.mtime.toISOString(),
                guid: normalizedPath,
            };
        }
        catch (err) {
            console.warn(`[LocalFileStrategy] Failed to read file ${filePath}:`, err.message);
            return null;
        }
    }
    extractTitle(content, filePath) {
        // 1. Try extracting YAML frontmatter title (e.g. title: "My Title" or title: My Title)
        const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (frontmatterMatch) {
            const yaml = frontmatterMatch[1];
            const titleMatch = yaml.match(/^title:\s*["']?(.*?)["']?$/m);
            if (titleMatch && titleMatch[1].trim().length > 0) {
                return titleMatch[1].trim();
            }
        }
        // 2. Try extracting first Markdown H1 header (# Title)
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match && h1Match[1].trim().length > 0) {
            return h1Match[1].trim();
        }
        // 3. Fallback to filename without extension
        const base = path.basename(filePath, path.extname(filePath));
        return base || "Untitled Note";
    }
    extractCleanText(raw) {
        let clean = raw.rawContent || "";
        // 1. Strip YAML frontmatter if present
        clean = clean.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
        // 2. Normalize multiple whitespace and newlines
        clean = clean.replace(/\s+/g, " ").trim();
        // 3. Calculate SHA-256 hash
        const contentHash = crypto.createHash("sha256").update(clean, "utf8").digest("hex");
        return {
            id: raw.id,
            sourceId: raw.sourceId,
            title: raw.title,
            textContent: clean,
            originUrl: raw.originUrl,
            contentHash,
        };
    }
}
//# sourceMappingURL=local-file-strategy.js.map