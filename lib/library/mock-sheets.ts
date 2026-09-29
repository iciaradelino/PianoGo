export type Difficulty = "Beginner" | "Intermediate" | "Advanced";
export type PracticeStatus = "Not started" | "In progress" | "Completed";

export type MockSheet = {
  id: number;
  title: string;
  composer: string;
  difficulty: Difficulty;
  status: PracticeStatus;
};

export const mockSheets: MockSheet[] = [
  {
    id: 1,
    title: "Moonlight Sonata",
    composer: "Ludwig van Beethoven",
    difficulty: "Advanced",
    status: "In progress",
  },
  {
    id: 2,
    title: "Prelude in C Major",
    composer: "Johann Sebastian Bach",
    difficulty: "Intermediate",
    status: "Completed",
  },
  {
    id: 3,
    title: "Gymnopédie No. 1",
    composer: "Erik Satie",
    difficulty: "Intermediate",
    status: "In progress",
  },
  {
    id: 4,
    title: "Clair de Lune",
    composer: "Claude Debussy",
    difficulty: "Advanced",
    status: "Not started",
  },
  {
    id: 5,
    title: "Minuet in G Major",
    composer: "Christian Petzold",
    difficulty: "Beginner",
    status: "Completed",
  },
  {
    id: 6,
    title: "Ode to Joy",
    composer: "Ludwig van Beethoven",
    difficulty: "Beginner",
    status: "In progress",
  },
  {
    id: 7,
    title: "Nocturne Op. 9 No. 2",
    composer: "Frédéric Chopin",
    difficulty: "Advanced",
    status: "Not started",
  },
  {
    id: 8,
    title: "Canon in D",
    composer: "Johann Pachelbel",
    difficulty: "Intermediate",
    status: "Not started",
  },
];
