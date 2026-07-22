import { Groups, GroupDetectionImageSource } from './types';
import { detectPeople } from './detectPeople';
import { convertToGroups } from './convertToGroups';

// グループの検出 (人物をグループに見せかけてそのまま返す)
export async function getGroups(imageSource: GroupDetectionImageSource): Promise<Groups> {

  if (!imageSource) throw new Error("No input data exists");

  try {
    const people = await detectPeople(imageSource);
    const groups = convertToGroups(people);
    return groups;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}

export * from './types';
