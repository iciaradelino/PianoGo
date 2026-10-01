export type Difficulty = "Beginner" | "Intermediate" | "Advanced";
export type PracticeStatus = "Not started" | "In progress" | "Completed";
export type FileType = "pdf" | "musicxml";

export type Sheet = {
  id: number;
  title: string;
  composer: string;
  difficulty: Difficulty;
  status: PracticeStatus;
  originalFilename: string;
  fileType: FileType;
  isFavorite: boolean;
  createdAt: string;
};

export type SheetDraft = {
  title: string;
  composer: string;
  difficulty: Difficulty;
  file: File;
};
