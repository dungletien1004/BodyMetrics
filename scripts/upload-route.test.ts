import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serveUpload, type UploadUser } from "../src/lib/uploads/serve";

const readyUser: UploadUser = { id: "user-1", role: "user", mustChangePassword: false };
const noTarget = async () => null;

describe("upload route authentication and ownership", () => {
  it("returns 401 instead of redirecting when signed out", async () => {
    const response = await serveUpload({ path: ["blob-1"], user: null, resolveViewAsUserId: noTarget, readImage: async () => null });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("location"), null);
  });

  it("returns 401 instead of redirecting before the required password change", async () => {
    const response = await serveUpload({
      path: ["blob-1"],
      user: { ...readyUser, mustChangePassword: true },
      resolveViewAsUserId: noTarget,
      readImage: async () => null,
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("location"), null);
  });

  it("serves an image only when it belongs to the current user", async () => {
    let queriedUserId = "";
    const response = await serveUpload({
      path: ["blob-1"],
      user: readyUser,
      resolveViewAsUserId: noTarget,
      readImage: async (_id, userId) => {
        queriedUserId = userId;
        return userId === "user-1" ? { data: new Uint8Array([1, 2, 3]), mime: "image/webp" } : null;
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.equal(queriedUserId, "user-1");

    const foreignImage = await serveUpload({
      path: ["blob-2"],
      user: readyUser,
      resolveViewAsUserId: noTarget,
      readImage: async (_id, userId) => (userId === "other-user" ? { data: new Uint8Array([4]), mime: "image/webp" } : null),
    });
    assert.equal(foreignImage.status, 404);
  });

  it("honors the validated account selected by an admin's view-as session", async () => {
    let queriedUserId = "";
    const response = await serveUpload({
      path: ["blob-1"],
      user: { ...readyUser, id: "admin-1", role: "admin" },
      viewAsId: "target-1",
      resolveViewAsUserId: async (id) => (id === "target-1" ? id : null),
      readImage: async (_id, userId) => {
        queriedUserId = userId;
        return { data: new Uint8Array([1]), mime: "image/webp" };
      },
    });
    assert.equal(response.status, 200);
    assert.equal(queriedUserId, "target-1");
  });

  it("returns 404 for invalid paths", async () => {
    const response = await serveUpload({ path: ["nested", "blob-1"], user: readyUser, resolveViewAsUserId: noTarget, readImage: async () => null });
    assert.equal(response.status, 404);
  });
});
