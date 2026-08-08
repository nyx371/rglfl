// GRIDFORGE static data: version, items, recipes, buildings, techs, perks.

const VERSION = "1.5";
const VERSION_SNIPPET = "Fixes machines starving beside a full stockpile";

// Research points get their own mark, distinct from the flask item.
const RP_ICON = "research";
const RP_COLOR = "#9ecbff";

const ITEMS = {
  ironOre:     { name: "Iron Ore",     icon: "ore",       color: "#7fb3f0" },
  copperOre:   { name: "Copper Ore",   icon: "ore",       color: "#ff8f4d" },
  coal:        { name: "Coal",         icon: "coal",      color: "#3d444d" },
  stone:       { name: "Stone",        icon: "stone",     color: "#cdb389" },
  crystal:     { name: "Crystal",      icon: "crystal",   color: "#5ee6ff" },
  titanium:    { name: "Titanium",     icon: "titan",     color: "#7cf0b8" },
  ironPlate:   { name: "Iron Plate",   icon: "plate",     color: "#d9e6f5" },
  copperPlate: { name: "Copper Plate", icon: "plate",     color: "#ffb377" },
  steelPlate:  { name: "Steel Plate",  icon: "plate",     color: "#8f9bb3" },
  gear:        { name: "Gear",         icon: "gear",      color: "#aeb9c6" },
  wire:        { name: "Wire",         icon: "wire",      color: "#ffd166" },
  circuit:     { name: "Circuit",      icon: "circuit",   color: "#69e884" },
  processor:   { name: "Processor",    icon: "processor", color: "#c88bff" },
  flask:       { name: "Flask",        icon: "flask",     color: "#8ab4f0" },
  crystalFlask:{ name: "Crystal Flask",icon: "flask",     color: "#5ee6ff" },
  dataFlask:   { name: "Data Flask",   icon: "flask",     color: "#c88bff" },
};

// Resource tile types (what drills / manual mining yield).
// Tile colors are pushed apart so fields read distinctly at any zoom.
const RESOURCES = {
  ironOre:   { tileColor: "#2e4a70", needsTech: null },
  copperOre: { tileColor: "#77401f", needsTech: null },
  coal:      { tileColor: "#15181d", needsTech: null },
  stone:     { tileColor: "#635640", needsTech: null },
  crystal:   { tileColor: "#0e5a6e", needsTech: "crystalDrilling" },
  titanium:  { tileColor: "#14503c", needsTech: "deepDrilling" },
};

// Recipes. time in seconds at 1x speed.
const RECIPES = {
  ironPlate:    { name: "Iron Plate",    machine: "smelter",   time: 2,   in: { ironOre: 2, coal: 1 },   out: { ironPlate: 1 },    needsTech: null },
  copperPlate:  { name: "Copper Plate",  machine: "smelter",   time: 2,   in: { copperOre: 2, coal: 1 }, out: { copperPlate: 1 },  needsTech: null },
  steelPlate:   { name: "Steel Plate",   machine: "smelter",   time: 6,   in: { ironPlate: 5, coal: 2 }, out: { steelPlate: 1 },   needsTech: "steelProcessing" },
  gear:         { name: "Gear",          machine: "assembler", time: 1.5, in: { ironPlate: 2 },          out: { gear: 1 },         needsTech: null },
  wire:         { name: "Wire",          machine: "assembler", time: 1,   in: { copperPlate: 1 },        out: { wire: 2 },         needsTech: null },
  circuit:      { name: "Circuit",       machine: "assembler", time: 3,   in: { ironPlate: 1, wire: 3 }, out: { circuit: 1 },      needsTech: "electronics" },
  processor:    { name: "Processor",     machine: "assembler", time: 9,   in: { circuit: 2, steelPlate: 2, titanium: 1 }, out: { processor: 1 }, needsTech: "processors" },
  flask:        { name: "Flask",         machine: "assembler", time: 4,   in: { gear: 1, wire: 1 },      out: { flask: 1 },        needsTech: null },
  crystalFlask: { name: "Crystal Flask", machine: "assembler", time: 6,   in: { circuit: 1, crystal: 2 },out: { crystalFlask: 1 }, needsTech: "advancedFlasks" },
  dataFlask:    { name: "Data Flask",    machine: "assembler", time: 14,  in: { processor: 1, crystalFlask: 1 }, out: { dataFlask: 1 }, needsTech: "dataAnalysis" },
  labFlask:     { name: "Flask → 1 RP",           machine: "lab", time: 2,  in: { flask: 1 },        out: {}, rp: 1,   needsTech: null },
  labCrystal:   { name: "Crystal Flask → 10 RP",  machine: "lab", time: 4,  in: { crystalFlask: 1 }, out: {}, rp: 10,  needsTech: "advancedFlasks" },
  labData:      { name: "Data Flask → 120 RP",    machine: "lab", time: 10, in: { dataFlask: 1 },    out: {}, rp: 120, needsTech: "dataAnalysis" },
};

const BUILDINGS = {
  drill: {
    name: "Drill", icon: "drill",
    desc: "Place on a resource tile. Mines it automatically.",
    // Smelted plates, not raw ore: you must stand up a smelter before you can
    // automate mining, so the opening teaches the chain in order.
    cost: { ironPlate: 4, stone: 5 },
    placeOn: "resource",
    baseRate: 0.3, // items per second at 1x
  },
  smelter: {
    name: "Smelter", icon: "smelter",
    desc: "Smelts ore into plates. Uses coal.",
    cost: { stone: 15 },
    placeOn: "free",
    defaultRecipe: "ironPlate",
  },
  assembler: {
    name: "Assembler", icon: "assembler",
    desc: "Crafts parts and research flasks from plates.",
    cost: { ironPlate: 10, stone: 10 },
    placeOn: "free",
    defaultRecipe: "gear",
  },
  lab: {
    name: "Lab", icon: "lab",
    desc: "Burns flasks to produce research points.",
    cost: { gear: 5, copperPlate: 5 },
    placeOn: "free",
    defaultRecipe: "labFlask",
  },
  relay: {
    name: "Relay", icon: "relay",
    desc: "Extends the transfer grid. Buildings only work inside relay range.",
    cost: { stone: 10 },
    placeOn: "free",
    radius: 6,
  },
  // Pylons: passive aura towers. Each projects a bonus over everything in
  // radius, stacks additively with other pylons, and grows in both strength
  // and reach with each Mk level — so upgrading one is also widening it.
  pylonSpeed: {
    name: "Overclock Pylon", icon: "pylonSpeed",
    desc: "Speeds up every drill and machine in range.",
    cost: { steelPlate: 8, circuit: 6 },
    placeOn: "free",
    needsTech: "fieldProjection",
    aura: { stat: "speed", per: 0.25, radius: 4 },
  },
  pylonYield: {
    name: "Enrichment Pylon", icon: "pylonYield",
    desc: "Drills in range pull more ore per swing.",
    cost: { steelPlate: 8, crystal: 10 },
    placeOn: "free",
    needsTech: "fieldProjection",
    aura: { stat: "yield", per: 0.2, radius: 4 },
  },
  pylonMind: {
    name: "Insight Pylon", icon: "pylonMind",
    desc: "Labs in range squeeze more research from every flask.",
    cost: { steelPlate: 10, processor: 4 },
    placeOn: "free",
    needsTech: "cognition",
    aura: { stat: "rp", per: 0.35, radius: 4 },
  },
  base: {
    name: "Base Beacon", icon: "relay",
    desc: "Your landing site. The heart of the transfer grid.",
    cost: {},
    placeOn: "free",
    radius: 8,
    hidden: true, // never offered in build menus, cannot be demolished
  },
};

// Techs. Repeatable ones have costGrowth (cost = base * growth^level).
const TECHS = {
  drillSpeed:    { name: "Drill Velocity",   icon: "drill",   repeat: true,  baseCost: 10,  costGrowth: 3, effect: "Drills work 50% faster per level", mult: 1.5 },
  smeltSpeed:    { name: "Hotter Furnaces",  icon: "smelter", repeat: true,  baseCost: 10,  costGrowth: 3, effect: "Smelters work 50% faster per level", mult: 1.5 },
  craftSpeed:    { name: "Servo Arms",       icon: "assembler", repeat: true, baseCost: 10, costGrowth: 3, effect: "Assemblers work 50% faster per level", mult: 1.5 },
  labSpeed:      { name: "Peer Review",      icon: "lab",     repeat: true,  baseCost: 15,  costGrowth: 3, effect: "Labs work 50% faster per level", mult: 1.5 },
  manualMining:  { name: "Powered Picks",    icon: "mine",    repeat: true,  baseCost: 5,   costGrowth: 3, effect: "Manual mining yields x2 per level", mult: 2 },
  relayRange:    { name: "Signal Boost",     icon: "relay",   repeat: true,  baseCost: 25,  costGrowth: 3, effect: "+1 relay aura radius per level" },
  electronics:   { name: "Electronics",      icon: "circuit", repeat: false, baseCost: 20,  itemCost: {}, effect: "Unlocks the Circuit recipe" },
  crystalDrilling:{ name: "Crystal Drilling",icon: "crystal", repeat: false, baseCost: 50,  itemCost: { circuit: 5 }, effect: "Drills and picks can mine Crystal" },
  advancedFlasks:{ name: "Advanced Flasks",  icon: "flask",   repeat: false, baseCost: 100, itemCost: { crystal: 10 }, effect: "Crystal Flasks worth 10 RP each" },
  blastDrilling: { name: "Blast Drilling",   icon: "bolt",    repeat: false, baseCost: 200, itemCost: { circuit: 20 }, effect: "All drill output doubled" },
  steelProcessing:{ name: "Steel Processing",icon: "plate",   repeat: false, baseCost: 300, itemCost: { ironPlate: 100 }, effect: "Unlocks the Steel Plate recipe" },
  machineOverhaul:{ name: "Machine Overhaul",icon: "hammer",  repeat: false, baseCost: 600, itemCost: { steelPlate: 40 }, effect: "Machines can be upgraded Mk2, Mk3, …" },
  deepDrilling:  { name: "Deep Drilling",    icon: "titan",   repeat: false, baseCost: 1200, itemCost: { steelPlate: 60 }, effect: "Drills and picks can mine Titanium" },
  processors:    { name: "Processors",       icon: "processor",repeat: false,baseCost: 2500, itemCost: { steelPlate: 80, crystal: 40 }, effect: "Unlocks the Processor recipe" },
  dataAnalysis:  { name: "Data Analysis",    icon: "flask",   repeat: false, baseCost: 6000, itemCost: { processor: 25 }, effect: "Data Flasks worth 120 RP each" },
  fieldProjection:{ name: "Field Projection",icon: "pylonSpeed", repeat: false, baseCost: 900, itemCost: { steelPlate: 30, circuit: 30 }, effect: "Unlocks Overclock and Enrichment Pylons" },
  cognition:     { name: "Cognition",        icon: "pylonMind",  repeat: false, baseCost: 4000, itemCost: { processor: 10 }, effect: "Unlocks the Insight Pylon" },
};

// Per-machine upgrade track (unlocked by Machine Overhaul). Each level doubles
// that one machine's speed; cost doubles with it, so it never stops mattering.
const UPGRADE = {
  baseCost: { steelPlate: 10, circuit: 5 },
  growth: 2,
  speedPerLevel: 2,
};

// Core-deposit perk pool. Effects are read by multiplier helpers in game.js.
const PERKS = [
  { id: "overclock",  name: "Overclocked Drills", icon: "drill",     desc: "Drill speed x2" },
  { id: "frenzy",     name: "Furnace Frenzy",     icon: "smelter",   desc: "Smelter speed x2" },
  { id: "assembly",   name: "Assembly Line",      icon: "assembler", desc: "Assembler speed x2" },
  { id: "bigbrain",   name: "Big Brain",          icon: "lab",       desc: "Research speed x2" },
  { id: "ironfist",   name: "Iron Fist",          icon: "mine",      desc: "Manual mining x3" },
  { id: "lucky",      name: "Lucky Strikes",      icon: "bolt",      desc: "+20% chance drills strike double" },
  { id: "richveins",  name: "Rich Veins",         icon: "ore",       desc: "Drill yield +50%" },
  { id: "sturdy",     name: "Sturdy Picks",       icon: "rock",      desc: "Core deposits take x2 damage" },
  { id: "hoard",      name: "Hoarder's Cache",    icon: "crate",     desc: "Instant stash of every raw resource" },
  { id: "engineer",   name: "Master Engineer",    icon: "hammer",    desc: "Machine upgrades cost half" },
  { id: "deepveins",  name: "Deep Veins",         icon: "titan",     desc: "Crystal and Titanium yield x3" },
  { id: "network",    name: "Wide Broadcast",     icon: "relay",     desc: "Relay aura radius +3" },
];
