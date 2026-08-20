import { Groups } from "./types";

// `Group`型を無理やり`Groups`型に変換
export function convertToGroups(people: any[]): Groups {
  return people.map((detectedPerson) => [detectedPerson]);
}
