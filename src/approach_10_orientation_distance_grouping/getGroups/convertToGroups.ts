import { Groups, Person } from "./types";

// `Person`型の配列を強制的に`Groups`型に変換
export function convertToGroups(people: Person[]): Groups {
  return people.map((detectedPerson) => [detectedPerson]);
}
