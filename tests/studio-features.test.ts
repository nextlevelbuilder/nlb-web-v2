import { describe, it, expect, vi } from "vitest";
import { POST as uploadMediaPost } from "@/app/api/v1/media/upload/route";
import { AVAILABLE_BLOCKS } from "@/components/studio/block-selector-dropdown";
import { BlockSchema } from "@/packages/contracts/src";

describe("Studio Features & Cloudflare R2 Uploads", () => {
  it("registers every supported block type exactly once in the selector", () => {
    const types = AVAILABLE_BLOCKS.map((b) => b.type);
    const schemaTypes = BlockSchema.options.map((option) => option.shape.type.value);
    expect([...types].sort()).toEqual([...schemaTypes].sort());
    expect(new Set(types).size).toBe(types.length);
    expect(types).toContain("analytics");
    expect(types).toContain("activities");
    expect(types).toContain("pulse");
  });

  it("should reject media upload when no file is provided", async () => {
    const formData = new FormData();
    const req = new Request("http://localhost:3000/api/v1/media/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadMediaPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/No file provided/i);
  });

  it("should reject media upload for unsupported MIME types", async () => {
    const formData = new FormData();
    const badFile = new File(["malicious script"], "payload.sh", { type: "application/x-sh" });
    formData.append("file", badFile);

    const req = new Request("http://localhost:3000/api/v1/media/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadMediaPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Unsupported file type/i);
  });

  it("should accept valid image upload and return asset URL", async () => {
    const formData = new FormData();
    const validImage = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "test-logo.png", {
      type: "image/png",
    });
    formData.append("file", validImage);
    formData.append("folder", "logos");

    const req = new Request("http://localhost:3000/api/v1/media/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadMediaPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.url).toMatch(/\.png$/);
    expect(data.mimeType).toBe("image/png");
  });
});
