// ============================================================================
// Manually curated airdrop database (MVP — top projects for 2026)
// Update this as new major projects launch
// ============================================================================

export interface AirdropTask {
  id: string;
  title: string;
  description: string;
  type: "onchain" | "social" | "registration" | "testnet";
  automated: boolean; // Claude can execute this
  estimatedMinutes: number;
  links?: string[];
}

export interface AirdropProject {
  slug: string;
  name: string;
  description: string;
  chains: string[];
  funding: number; // USD millions
  difficulty: "easy" | "medium" | "hard";
  snapshotDate: string | null; // ISO date or null if unknown
  deadline: string | null;
  estimatedRewardMin: number; // USD
  estimatedRewardMax: number; // USD
  status: "active" | "ended" | "upcoming";
  tasks: AirdropTask[];
  requiredTxPerWeek: number;
  requiredProtocols: number;
  notes: string;
  officialUrl: string;
}

export const CURATED_AIRDROPS: AirdropProject[] = [
  {
    slug: "monad",
    name: "Monad",
    description: "High-performance EVM-compatible L1 with parallel execution. $244M funded.",
    chains: ["monad-testnet"],
    funding: 244,
    difficulty: "medium",
    snapshotDate: null,
    deadline: "2026-06-01",
    estimatedRewardMin: 500,
    estimatedRewardMax: 3000,
    status: "active",
    requiredTxPerWeek: 10,
    requiredProtocols: 3,
    officialUrl: "https://monad.xyz",
    notes: "Testnet is live. Focus on using multiple DeFi protocols — simple transfers don't count much.",
    tasks: [
      {
        id: "monad-faucet",
        title: "Get testnet tokens from faucet",
        description: "Visit the Monad faucet and claim testnet MON tokens",
        type: "registration",
        automated: false,
        estimatedMinutes: 5,
        links: ["https://faucet.monad.xyz"],
      },
      {
        id: "monad-txns",
        title: "Make 10+ transactions per week",
        description: "Send transactions on Monad testnet — swaps, transfers, or contract interactions",
        type: "testnet",
        automated: true,
        estimatedMinutes: 10,
      },
      {
        id: "monad-protocols",
        title: "Use 3+ different protocols",
        description: "Interact with at least 3 different DeFi protocols on Monad testnet",
        type: "testnet",
        automated: true,
        estimatedMinutes: 20,
      },
      {
        id: "monad-discord",
        title: "Join Discord and get role",
        description: "Join Monad Discord, complete verification, get testnet participant role",
        type: "social",
        automated: false,
        estimatedMinutes: 10,
        links: ["https://discord.gg/monad"],
      },
    ],
  },
  {
    slug: "megaeth",
    name: "MegaETH",
    description: "Real-time blockchain with 100,000+ TPS. $107M funded by Dragonfly, EigenLayer.",
    chains: ["megaeth-testnet"],
    funding: 107,
    difficulty: "easy",
    snapshotDate: null,
    deadline: "2026-05-01",
    estimatedRewardMin: 200,
    estimatedRewardMax: 800,
    status: "active",
    requiredTxPerWeek: 5,
    requiredProtocols: 2,
    officialUrl: "https://megaeth.systems",
    notes: "Early testnet. Less competition than Monad. Good risk/reward ratio.",
    tasks: [
      {
        id: "megaeth-faucet",
        title: "Claim testnet ETH",
        description: "Get testnet ETH from the MegaETH faucet",
        type: "registration",
        automated: false,
        estimatedMinutes: 5,
        links: ["https://faucet.megaeth.systems"],
      },
      {
        id: "megaeth-txns",
        title: "Make 5+ transactions per week",
        description: "Regular on-chain activity to demonstrate engagement",
        type: "testnet",
        automated: true,
        estimatedMinutes: 10,
      },
      {
        id: "megaeth-twitter",
        title: "Follow on Twitter/X",
        description: "Follow @MegaETH_Global on Twitter",
        type: "social",
        automated: false,
        estimatedMinutes: 2,
        links: ["https://twitter.com/MegaETH_Global"],
      },
    ],
  },
  {
    slug: "aztec",
    name: "Aztec Network",
    description: "Privacy-first L2 using ZK proofs. Backed by a16z, Paradigm.",
    chains: ["aztec-testnet"],
    funding: 100,
    difficulty: "hard",
    snapshotDate: null,
    deadline: null,
    estimatedRewardMin: 1000,
    estimatedRewardMax: 10000,
    status: "active",
    requiredTxPerWeek: 3,
    requiredProtocols: 2,
    officialUrl: "https://aztec.network",
    notes: "Higher difficulty = less competition. ZK privacy focus makes it unique. High potential reward.",
    tasks: [
      {
        id: "aztec-setup",
        title: "Install Aztec sandbox locally",
        description: "Run Aztec node/sandbox locally to participate in the testnet",
        type: "testnet",
        automated: false,
        estimatedMinutes: 30,
        links: ["https://docs.aztec.network/getting_started"],
      },
      {
        id: "aztec-deploy",
        title: "Deploy a private contract",
        description: "Deploy and interact with a private smart contract on Aztec testnet",
        type: "testnet",
        automated: false,
        estimatedMinutes: 60,
      },
      {
        id: "aztec-discord",
        title: "Participate in Discord",
        description: "Join Aztec Discord, report bugs, engage with the community",
        type: "social",
        automated: false,
        estimatedMinutes: 15,
        links: ["https://discord.gg/aztec"],
      },
    ],
  },
  {
    slug: "somnia",
    name: "Somnia",
    description: "Consumer-focused L1 targeting gaming and entertainment. Up to 400,000 TPS.",
    chains: ["somnia-testnet"],
    funding: 50,
    difficulty: "easy",
    snapshotDate: null,
    deadline: "2026-04-30",
    estimatedRewardMin: 100,
    estimatedRewardMax: 500,
    status: "active",
    requiredTxPerWeek: 5,
    requiredProtocols: 1,
    officialUrl: "https://somnia.network",
    notes: "Easy tasks, low competition so far. Good for beginners.",
    tasks: [
      {
        id: "somnia-faucet",
        title: "Get STT tokens from faucet",
        description: "Claim Somnia testnet tokens",
        type: "registration",
        automated: false,
        estimatedMinutes: 5,
        links: ["https://faucet.somnia.network"],
      },
      {
        id: "somnia-txns",
        title: "Regular transactions",
        description: "Make at least 5 transactions per week on Somnia testnet",
        type: "testnet",
        automated: true,
        estimatedMinutes: 10,
      },
    ],
  },
  {
    slug: "starknet",
    name: "StarkNet",
    description: "ZK-rollup L2 on Ethereum. Ongoing retroactive rewards program.",
    chains: ["starknet"],
    funding: 200,
    difficulty: "medium",
    snapshotDate: "2026-07-01",
    deadline: "2026-06-30",
    estimatedRewardMin: 200,
    estimatedRewardMax: 2000,
    status: "active",
    requiredTxPerWeek: 3,
    requiredProtocols: 3,
    officialUrl: "https://starknet.io",
    notes: "Mainnet activity counts. Use AVNU for swaps, zkLend for lending. Snapshot rumored for Q3 2026.",
    tasks: [
      {
        id: "starknet-wallet",
        title: "Set up ArgentX or Braavos wallet",
        description: "Create a StarkNet wallet using ArgentX or Braavos browser extension",
        type: "registration",
        automated: false,
        estimatedMinutes: 10,
        links: ["https://www.argent.xyz/argent-x/"],
      },
      {
        id: "starknet-bridge",
        title: "Bridge ETH to StarkNet",
        description: "Use StarkGate to bridge ETH from Ethereum mainnet to StarkNet",
        type: "onchain",
        automated: false,
        estimatedMinutes: 15,
        links: ["https://starkgate.starknet.io"],
      },
      {
        id: "starknet-swap",
        title: "Swap on AVNU DEX",
        description: "Make swaps on AVNU, the main DEX aggregator on StarkNet",
        type: "onchain",
        automated: false,
        estimatedMinutes: 10,
        links: ["https://app.avnu.fi"],
      },
    ],
  },
];

export function getProjectBySlug(slug: string): AirdropProject | undefined {
  return CURATED_AIRDROPS.find((p) => p.slug === slug);
}

export function searchProjects(query?: string, chains?: string[], difficulty?: string, minFunding?: number): AirdropProject[] {
  return CURATED_AIRDROPS.filter((p) => {
    if (p.status === "ended") return false;
    if (query && !p.name.toLowerCase().includes(query.toLowerCase()) && !p.description.toLowerCase().includes(query.toLowerCase())) return false;
    if (chains && chains.length > 0 && !chains.some((c) => p.chains.some((pc) => pc.includes(c.toLowerCase())))) return false;
    if (difficulty && p.difficulty !== difficulty) return false;
    if (minFunding && p.funding < minFunding) return false;
    return true;
  }).sort((a, b) => b.funding - a.funding);
}

export function getUpcomingSnapshots(daysAhead: number = 90): AirdropProject[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  return CURATED_AIRDROPS.filter((p) => {
    const date = p.snapshotDate || p.deadline;
    if (!date) return false;
    const projectDate = new Date(date);
    return projectDate <= cutoff && projectDate > new Date();
  }).sort((a, b) => {
    const dateA = new Date(a.snapshotDate || a.deadline || "9999");
    const dateB = new Date(b.snapshotDate || b.deadline || "9999");
    return dateA.getTime() - dateB.getTime();
  });
}
