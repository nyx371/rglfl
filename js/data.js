// GRIDFORGE static data: version, items, recipes, buildings, techs, perks.

const VERSION = "0.5";
const VERSION_SNIPPET = "Radial build menu and percentage resource allocation";

const ITEMS = {
  ironOre:     { name: "Iron Ore",     icon: "ore",     color: "#7fb3f0" },
  copperOre:   { name: "Copper Ore",   icon: "ore",     color: "#ff8f4d" },
  coal:        { name: "Coal",         icon: "coal",    color: "#3d444d" },
  stone:       { name: "Stone",        icon: "stone",   color: "#cdb389" },
  crystal:     { name: "Crystal",      icon: "crystal", color: "#5ee6ff" },
  ironPlate:   { name: "Iron Plate",   icon: "plate",   color: "#d9e6f5" },
  copperPlate: { name: "Copper Plate", icon: "plate",   color: "#ffb377" },
  gear:        { name: "Gear",         icon: "gear",    color: "#aeb9c6" },
  wire:        { name: "Wire",         icon: "wire",    color: "#ffd166" },
  circuit:     { name: "Circuit",      icon: "circuit", color: "#69e884" },
  flask:       { name: "Flask",        icon: "flask",   color: "#8ab4f0" },
  crystalFlask:{ name: "Crystal Flask",icon: "flask",   color: "#5ee6ff" },
};

// Resource tile types (what drills / manual mining yield).
// Tile colors are pushed apart so fields read distinctly at any zoom.
const RESOURCES = {
  ironOre:   { tileColor: "#2e4a70", needsTech: null },
  copperOre: { tileColor: "#77401f", needsTech: null },
  coal:      { tileColor: "#15181d", needsTech: null },
  stone:     { tileColor: "#635640", needsTech: null },
  crystal:   { tileColor: "#0e5a6e", needsTech: "crystalDrilling" },
};

// Recipes. time in seconds at 1x speed.
const RECIPES = {
  ironPlate:    { name: "Iron Plate",    machine: "smelter",   time: 2,   in: { ironOre: 2, coal: 1 },   out: { ironPlate: 1 },    needsTech: null },
  copperPlate:  { name: "Copper Plate",  machine: "smelter",   time: 2,   in: { copperOre: 2, coal: 1 }, out: { copperPlate: 1 },  needsTech: null },
  gear:         { name: "Gear",          machine: "assembler", time: 1.5, in: { ironPlate: 2 },          out: { gear: 1 },         needsTech: null },
  wire:         { name: "Wire",          machine: "assembler", time: 1,   in: { copperPlate: 1 },        out: { wire: 2 },         needsTech: null },
  circuit:      { name: "Circuit",       machine: "assembler", time: 3,   in: { ironPlate: 1, wire: 3 }, out: { circuit: 1 },      needsTech: "electronics" },
  flask:        { name: "Flask",         machine: "assembler", time: 4,   in: { gear: 1, wire: 1 },      out: { flask: 1 },        needsTech: null },
  crystalFlask: { name: "Crystal Flask", machine: "assembler", time: 6,   in: { circuit: 1, crystal: 2 },out: { crystalFlask: 1 }, needsTech: "advancedFlasks" },
  labFlask:     { name: "Flask → 1 RP",          machine: "lab", time: 2, in: { flask: 1 },        out: {}, rp: 1,  needsTech: null },
  labCrystal:   { name: "Crystal Flask → 10 RP", machine: "lab", time: 4, in: { crystalFlask: 1 }, out: {}, rp: 10, needsTech: "advancedFlasks" },
};

const BUILDINGS = {
  drill: {
    name: "Drill", icon: "drill",
    desc: "Place on a resource tile. Mines it automatically.",
    cost: { ironOre: 15, stone: 5 },
    placeOn: "resource",
    baseRate: 0.5, // items per second at 1x
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
];
