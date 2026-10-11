import { createContext, useContext } from 'react';
import { useParams } from 'react-router-dom';
import type { Studio } from './domain';

export const StudioContext = createContext<Studio | null>(null);
export function useStudio(): Studio {
  const studio = useContext(StudioContext);
  if (!studio) throw new Error('Студия не загружена');
  return studio;
}
export function useSlug(): string {
  const { slug } = useParams();
  if (!slug) throw new Error('Не указан адрес студии');
  return slug;
}
