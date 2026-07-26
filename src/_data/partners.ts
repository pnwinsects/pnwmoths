// Site-wide collaborators and funders shown in the footer banner (issue #64).
// Authoritative source: https://pnwmoths.biol.wwu.edu/about-us/site-credits/
// Logo PNGs live in public/images/logos/ (Vite publicDir -> /images/logos/).

export interface Partner {
  name: string;
  url: string;
  logo: string;
}

export interface Partners {
  collaborators: Partner[];
  funders: Partner[];
}

const collaborators: Partner[] = [
  { name: 'Western Washington University', url: 'https://www.biol.wwu.edu/biology/', logo: 'western.png' },
  { name: 'M.T. James Entomological Collection, Washington State University', url: 'https://museum.entomology.wsu.edu/', logo: 'wsu.png' },
  { name: 'Oregon State Arthropod Collection', url: 'https://osac.oregonstate.edu/', logo: 'osu.png' },
  { name: 'University of Idaho Entomology', url: 'https://www.uidaho.edu/agricultural-life-sciences/research-extension/entomology-museum', logo: 'vandals.png' },
  { name: 'Orma J. Smith Museum of Natural History, College of Idaho', url: 'https://collegeofidaho.edu/academics/museum/', logo: 'CI.png' },
  { name: 'Canadian National Collection of Insects, Arachnids and Nematodes', url: 'https://agriculture.canada.ca/en/science/collections/canadian-national-collection-insects-arachnids-and-nematodes', logo: 'canacoll.png' },
  { name: 'Oregon Department of Agriculture', url: 'https://www.oregon.gov/oda', logo: 'orAg.png' },
  { name: 'Royal British Columbia Museum', url: 'https://www.royalbcmuseum.bc.ca/', logo: 'RBCM.png' },
  { name: 'Washington State Department of Agriculture', url: 'https://agr.wa.gov/', logo: 'wsda.png' },
  { name: 'Lucid', url: 'https://www.lucidcentral.com/', logo: 'lucid.png' },
  { name: 'Beaty Biodiversity Museum, University of British Columbia', url: 'https://www.beatymuseum.ubc.ca/', logo: 'ubc.png' },
];

const funders: Partner[] = [
  { name: 'National Science Foundation', url: 'https://www.nsf.gov/', logo: 'nsf.png' },
  { name: 'American Recovery and Reinvestment Act', url: 'https://www.nsf.gov/funding/opportunities/academic-research-infrastructure-program-recovery/503380/nsf09-562', logo: 'recovery.png' },
];

export default function (): Partners {
  return { collaborators, funders };
}
