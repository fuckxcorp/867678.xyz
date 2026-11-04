export const setText = (id: string, value: string): void => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

export const el = <T extends HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;
