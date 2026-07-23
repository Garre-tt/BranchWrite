export type AutosaveStatus = "clean" | "dirty" | "saving" | "error";

export type AutosaveSnapshot = {
  status: AutosaveStatus;
  version: number;
  contentHash: string;
  errorMessage: string | null;
};

export type SaveResult = {
  version: number;
  contentHash: string;
};

type AutosaveControllerOptions<Content> = {
  initialVersion: number;
  initialContentHash: string;
  debounceMs: number;
  save: (content: Content, expectedVersion: number) => Promise<SaveResult>;
  onSaved?: (result: SaveResult) => void;
};

export class AutosaveController<Content> {
  private snapshot: AutosaveSnapshot;
  private latestContent: Content | null = null;
  private dirty = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private activeFlush: Promise<boolean> | null = null;
  private readonly listeners = new Set<(snapshot: AutosaveSnapshot) => void>();

  constructor(private readonly options: AutosaveControllerOptions<Content>) {
    this.snapshot = {
      status: "clean",
      version: options.initialVersion,
      contentHash: options.initialContentHash,
      errorMessage: null,
    };
  }

  subscribe(listener: (snapshot: AutosaveSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): AutosaveSnapshot {
    return this.snapshot;
  }

  markDirty(content: Content): void {
    this.latestContent = content;
    this.dirty = true;
    this.updateSnapshot({
      ...this.snapshot,
      status: "dirty",
      errorMessage: null,
    });
    this.schedule();
  }

  async flush(): Promise<boolean> {
    this.clearTimer();

    if (this.activeFlush) {
      return this.activeFlush;
    }

    if (!this.dirty || this.latestContent === null) {
      return this.snapshot.status !== "error";
    }

    this.activeFlush = this.drain().finally(() => {
      this.activeFlush = null;
    });

    return this.activeFlush;
  }

  dispose(): void {
    this.clearTimer();
    this.listeners.clear();
  }

  private schedule(): void {
    this.clearTimer();
    this.debounceTimer = setTimeout(() => {
      void this.flush();
    }, this.options.debounceMs);
  }

  private async drain(): Promise<boolean> {
    while (this.dirty && this.latestContent !== null) {
      const content = this.latestContent;
      this.dirty = false;
      this.updateSnapshot({
        ...this.snapshot,
        status: "saving",
        errorMessage: null,
      });

      try {
        const result = await this.options.save(content, this.snapshot.version);
        this.snapshot = {
          status: this.dirty ? "dirty" : "clean",
          version: result.version,
          contentHash: result.contentHash,
          errorMessage: null,
        };
        this.emit();
        this.options.onSaved?.(result);
      } catch (error) {
        this.latestContent = content;
        this.dirty = true;
        this.updateSnapshot({
          ...this.snapshot,
          status: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : "BranchWrite could not save this draft.",
        });
        return false;
      }
    }

    return true;
  }

  private clearTimer(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private updateSnapshot(snapshot: AutosaveSnapshot): void {
    this.snapshot = snapshot;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
