import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AutosaveController,
  type SaveResult,
} from "../../src/client/autosave-controller";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AutosaveController", () => {
  it("debounces a dirty draft for 750 milliseconds", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (): Promise<SaveResult> => ({
      version: 1,
      contentHash: "hash-1",
    }));
    const controller = new AutosaveController({
      initialVersion: 0,
      initialContentHash: "hash-0",
      debounceMs: 750,
      save,
    });

    controller.markDirty("draft");
    await vi.advanceTimersByTimeAsync(749);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledWith("draft", 0);
    expect(controller.getSnapshot()).toMatchObject({
      status: "clean",
      version: 1,
      contentHash: "hash-1",
    });
  });

  it("serializes edits made while a save is in flight", async () => {
    const firstSave = deferred<SaveResult>();
    const save = vi
      .fn<(content: string, version: number) => Promise<SaveResult>>()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValueOnce({ version: 2, contentHash: "hash-2" });
    const controller = new AutosaveController({
      initialVersion: 0,
      initialContentHash: "hash-0",
      debounceMs: 750,
      save,
    });

    controller.markDirty("first");
    const flush = controller.flush();
    controller.markDirty("second");
    firstSave.resolve({ version: 1, contentHash: "hash-1" });

    await expect(flush).resolves.toBe(true);
    expect(save.mock.calls).toEqual([
      ["first", 0],
      ["second", 1],
    ]);
    expect(controller.getSnapshot()).toMatchObject({
      status: "clean",
      version: 2,
    });
  });

  it("preserves dirty content after failure and succeeds on explicit retry", async () => {
    const save = vi
      .fn<(content: string, version: number) => Promise<SaveResult>>()
      .mockRejectedValueOnce(new Error("Disk unavailable"))
      .mockResolvedValueOnce({ version: 1, contentHash: "hash-1" });
    const controller = new AutosaveController({
      initialVersion: 0,
      initialContentHash: "hash-0",
      debounceMs: 750,
      save,
    });

    controller.markDirty("still here");
    await expect(controller.flush()).resolves.toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      version: 0,
      errorMessage: "Disk unavailable",
    });

    await expect(controller.flush()).resolves.toBe(true);
    expect(save).toHaveBeenLastCalledWith("still here", 0);
    expect(controller.getSnapshot()).toMatchObject({
      status: "clean",
      version: 1,
    });
  });
});
