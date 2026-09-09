import type {
  NewPhotoRecord,
  PhotoObjectStorage,
  PhotoRow,
} from "./photo-storage";

export interface PhotoInsertRepository {
  insertPhoto(photo: NewPhotoRecord): Promise<PhotoRow>;
  getPhoto(id: string, includeHidden?: boolean): Promise<PhotoRow | null>;
  findByHash(sha256: string): Promise<PhotoRow | null>;
}

type CleanupStorage = Pick<PhotoObjectStorage, "deleteObjects">;

function matchesAttempt(row: PhotoRow, photo: NewPhotoRecord) {
  return (
    row.id === photo.id &&
    row.object_key === photo.objectKey &&
    row.thumbnail_key === photo.thumbnailKey &&
    row.display_key === photo.displayKey &&
    row.sha256 === photo.sha256
  );
}

/**
 * Resolves D1's uncertain-commit case without deleting objects referenced by a
 * row that may already have committed. Orphaned objects are safer than a D1
 * row whose original and derivatives have been removed.
 */
export async function persistPhotoRecord(
  repository: PhotoInsertRepository,
  objects: CleanupStorage,
  photo: NewPhotoRecord,
) {
  try {
    return { photo: await repository.insertPhoto(photo), duplicate: false };
  } catch (insertError) {
    let committedById: PhotoRow | null;
    try {
      committedById = await repository.getPhoto(photo.id, true);
    } catch {
      throw insertError;
    }

    if (committedById) {
      if (matchesAttempt(committedById, photo)) {
        return { photo: committedById, duplicate: false };
      }
      throw insertError;
    }

    let duplicate: PhotoRow | null;
    try {
      duplicate = await repository.findByHash(photo.sha256);
    } catch {
      throw insertError;
    }

    if (duplicate && matchesAttempt(duplicate, photo)) {
      return { photo: duplicate, duplicate: false };
    }

    await objects
      .deleteObjects([photo.objectKey, photo.thumbnailKey, photo.displayKey])
      .catch(() => undefined);

    if (duplicate) {
      return { photo: duplicate, duplicate: true };
    }
    throw insertError;
  }
}
