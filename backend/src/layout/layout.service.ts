import { Injectable } from '@nestjs/common';
import { FileHistory, PositionedFileHistory } from '../parser/parser.types';

@Injectable()
export class LayoutService {
  private readonly folderColumns = 4;
  private readonly folderSpacing = 28;
  private readonly fileColumns = 5;
  private readonly fileSpacing = 3.2;

  positionFiles(files: FileHistory[]): PositionedFileHistory[] {
    const byFolder = new Map<string, FileHistory[]>();

    files.forEach((file) => {
      const bucket = byFolder.get(file.folder) ?? [];
      bucket.push(file);
      byFolder.set(file.folder, bucket);
    });

    const folders = Array.from(byFolder.keys()).sort();
    const folderBase = new Map<string, { x: number; z: number }>();

    folders.forEach((folder, index) => {
      const row = Math.floor(index / this.folderColumns);
      const col = index % this.folderColumns;
      folderBase.set(folder, {
        x: col * this.folderSpacing,
        z: row * this.folderSpacing,
      });
    });

    return folders.flatMap((folder) => {
      const filesInFolder = byFolder.get(folder) ?? [];
      filesInFolder.sort((a, b) => a.path.localeCompare(b.path));

      const base = folderBase.get(folder) ?? { x: 0, z: 0 };

      return filesInFolder.map((file, index) => {
        const row = Math.floor(index / this.fileColumns);
        const col = index % this.fileColumns;

        return {
          ...file,
          x: base.x + col * this.fileSpacing,
          z: base.z + row * this.fileSpacing,
          width: 2,
          depth: 2,
        };
      });
    });
  }
}
