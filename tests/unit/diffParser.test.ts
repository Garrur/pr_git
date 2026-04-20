import { parseDiff, filterReviewable, chunkForLLM } from '../../src/github/diffParser';

const SIMPLE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index abc1234..def5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,7 +1,10 @@
 import jwt from 'jsonwebtoken';
 
-export function signToken(payload: object): string {
-  return jwt.sign(payload, process.env.SECRET!);
+/**
+ * Signs a JWT with the application secret.
+ */
+export function signToken(payload: object, secret: string): string {
+  if (!secret) throw new Error('Secret is required');
+  return jwt.sign(payload, secret, { expiresIn: '1h' });
 }
 
 export function verifyToken(token: string): object {
`;

const MULTI_FILE_DIFF = `diff --git a/src/utils.ts b/src/utils.ts
index 0000001..0000002 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,5 @@
 export function add(a: number, b: number): number {
-  return a + b;
+  // fixed overflow for large integers
+  return Number(BigInt(a) + BigInt(b));
 }
+
+export const VERSION = '2.0.0';
diff --git a/package-lock.json b/package-lock.json
index 0000003..0000004 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,3 +1,3 @@
 {
-  "version": "1.0.0"
+  "version": "2.0.0"
 }
diff --git a/dist/bundle.min.js b/dist/bundle.min.js
index 0000005..0000006 100644
--- a/dist/bundle.min.js
+++ b/dist/bundle.min.js
@@ -1,1 +1,1 @@
-var a=1;
+var a=2;
`;

const NEW_FILE_DIFF = `diff --git a/src/newFile.ts b/src/newFile.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/newFile.ts
@@ -0,0 +1,5 @@
+export function hello(): string {
+  return 'hello';
+}
+
+export const PI = 3.14;
`;

const DELETED_FILE_DIFF = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function deprecated(): void {
-  // no-op
-}
`;

describe('parseDiff', () => {
  it('parses a simple two-hunk diff correctly', () => {
    const files = parseDiff(SIMPLE_DIFF);
    expect(files).toHaveLength(1);

    const [file] = files;
    expect(file).toBeDefined();
    expect(file!.oldPath).toBe('a/src/auth.ts');
    expect(file!.newPath).toBe('b/src/auth.ts');
    expect(file!.isNew).toBe(false);
    expect(file!.isDeleted).toBe(false);
    expect(file!.isBinary).toBe(false);
    expect(file!.hunks).toHaveLength(1);
  });

  it('assigns correct line numbers to added lines', () => {
    const files = parseDiff(SIMPLE_DIFF);
    const file = files[0]!;
    const hunk = file.hunks[0]!;

    const addedLines = hunk.lines.filter((l) => l.type === 'add');
    expect(addedLines.length).toBeGreaterThan(0);

    // All added lines should have a newLineNumber
    for (const line of addedLines) {
      expect(line.newLineNumber).toBeDefined();
      expect(line.oldLineNumber).toBeUndefined();
    }
  });

  it('assigns correct line numbers to deleted lines', () => {
    const files = parseDiff(SIMPLE_DIFF);
    const hunk = files[0]!.hunks[0]!;

    const deletedLines = hunk.lines.filter((l) => l.type === 'delete');
    expect(deletedLines.length).toBeGreaterThan(0);

    for (const line of deletedLines) {
      expect(line.oldLineNumber).toBeDefined();
      expect(line.newLineNumber).toBeUndefined();
    }
  });

  it('assigns both line numbers to context lines', () => {
    const files = parseDiff(SIMPLE_DIFF);
    const hunk = files[0]!.hunks[0]!;

    const contextLines = hunk.lines.filter((l) => l.type === 'context');
    expect(contextLines.length).toBeGreaterThan(0);

    for (const line of contextLines) {
      expect(line.newLineNumber).toBeDefined();
      expect(line.oldLineNumber).toBeDefined();
    }
  });

  it('parses multi-file diff and produces one ParsedFile per changed file', () => {
    const files = parseDiff(MULTI_FILE_DIFF);
    expect(files).toHaveLength(3);
    expect(files[0]!.newPath).toContain('src/utils.ts');
    expect(files[1]!.newPath).toContain('package-lock.json');
    expect(files[2]!.newPath).toContain('dist/bundle.min.js');
  });

  it('marks new files correctly (isNew = true, oldPath = /dev/null)', () => {
    const files = parseDiff(NEW_FILE_DIFF);
    expect(files).toHaveLength(1);
    const [file] = files;
    expect(file!.isNew).toBe(true);
    expect(file!.oldPath).toBe('/dev/null');
  });

  it('marks deleted files correctly (isDeleted = true, newPath = /dev/null)', () => {
    const files = parseDiff(DELETED_FILE_DIFF);
    expect(files).toHaveLength(1);
    const [file] = files;
    expect(file!.isDeleted).toBe(true);
    expect(file!.newPath).toBe('/dev/null');
  });

  it('returns empty array for empty diff string', () => {
    expect(parseDiff('')).toEqual([]);
    expect(parseDiff('\n\n')).toEqual([]);
  });
});

describe('filterReviewable', () => {
  it('removes package-lock.json', () => {
    const files = parseDiff(MULTI_FILE_DIFF);
    const filtered = filterReviewable(files);
    const paths = filtered.map((f) => f.newPath);
    expect(paths.every((p) => !p.includes('package-lock.json'))).toBe(true);
  });

  it('removes .min.js files', () => {
    const files = parseDiff(MULTI_FILE_DIFF);
    const filtered = filterReviewable(files);
    const paths = filtered.map((f) => f.newPath);
    expect(paths.every((p) => !p.includes('.min.js'))).toBe(true);
  });

  it('keeps TypeScript source files', () => {
    const files = parseDiff(MULTI_FILE_DIFF);
    const filtered = filterReviewable(files);
    expect(filtered.some((f) => f.newPath.includes('src/utils.ts'))).toBe(true);
  });

  it('removes binary files', () => {
    const binaryDiff = `diff --git a/image.png b/image.png
index 0000001..0000002 100644
Binary files a/image.png and b/image.png differ
`;
    const files = parseDiff(binaryDiff);
    // Mark binary manually as the parser should do it
    const filtered = filterReviewable(files);
    expect(filtered).toHaveLength(0);
  });
});

describe('chunkForLLM', () => {
  it('returns empty array when given no files', () => {
    expect(chunkForLLM([])).toEqual([]);
  });

  it('groups files into chunks within the line budget', () => {
    const files = parseDiff(MULTI_FILE_DIFF);
    const reviewable = filterReviewable(files);
    const chunks = chunkForLLM(reviewable, 150);

    expect(chunks.length).toBeGreaterThanOrEqual(1);

    // Every chunk should have at least one file
    for (const chunk of chunks) {
      expect(chunk.files.length).toBeGreaterThan(0);
    }
  });

  it('splits a very large file into its own chunk', () => {
    // Build a diff large enough to exceed maxLines=10
    let largeDiff = `diff --git a/src/big.ts b/src/big.ts
index 0000001..0000002 100644
--- a/src/big.ts
+++ b/src/big.ts
@@ -1,${30} +1,${30} @@
`;
    for (let i = 1; i <= 30; i++) {
      largeDiff += `+const line${i} = ${i};\n`;
    }

    const files = parseDiff(largeDiff);
    const chunks = chunkForLLM(files, 10); // tiny budget

    // Large file should be isolated in its own chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.files).toHaveLength(1);
  });

  it('places content of reviewable file into chunk', () => {
    const files = parseDiff(SIMPLE_DIFF);
    const chunks = chunkForLLM(files, 150);
    expect(chunks[0]!.files[0]!.content).toContain('src/auth.ts');
  });
});
