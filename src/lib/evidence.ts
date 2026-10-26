// Studies behind the coaching rules (shown in the app).

export const SOURCES = {
  fokkema: { label: 'Fokkema et al. 2020, Scand J Med Sci Sports', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7496388/' },
  doherty: { label: 'Doherty et al. 2020, J Sci Med Sport', url: 'https://pubmed.ncbi.nlm.nih.gov/31704026/' },
  casado: { label: 'Campos, Casado et al. 2022, Int J Sports Med', url: 'https://lida.sport-iat.de/ta/Record/4075045' },
  taper: { label: 'Wang et al. 2023, PLOS ONE (taper meta-analysis)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10171681/' },
  strength: { label: 'Llanos-Lagos et al. 2024, Sports Med', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11052887/' },
  tanda: { label: 'Tanda 2011, J Hum Sport Exerc', url: 'https://rua.ua.es/dspace/handle/10045/18930' },
  decoupling: { label: 'Smyth et al. 2022, Sports Med', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9388405/' },
} as const;

export type SourceKey = keyof typeof SOURCES;
