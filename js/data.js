// GRIDFORGE static data: version, items, recipes, buildings, techs, perks.

const VERSION = "0.1";
const VERSION_SNIPPET = "Drills, smelting, crafting, tech tree, core deposit perks";

const ITEMS = {
  ironOre:     { name: "Iron Ore",     icon: "ore",     color: "#a8b6c6" },
  copperOre:   { name: "Copper Ore",   icon: "ore",     color: "#e0925a" },
  coal:        { name: "Coal",         icon: "coal",    color: "#5c6670" },
  stone:       { name: "Stone",        icon: "stone",   color: "#9a9186" },
  crystal:     { name: "Crystal",      icon: "crystal", color: "#7fd4e8" },
  ironPlate:   { name: "Iron Plate",   icon: "plate",   color: "#c9d6e4" },
  copperPlate: { name: "Copper Plate", icon: "plate",   color: "#f0a266" },
  gear:        { name: "Gear",         icon: "gear",    color: "#b8c4d0" },
  wire:        { name: "Wire",         icon: "wire",    color: "#f0b070" },
  circuit:     { name: "Circuit",      icon: "circuit", color: "#7fe89a" },
  flask:       { name: "Flask",        icon: "flask",   color: "#8ab4f0" },
  crystalFlask:{ name: "Crystal Flask",icon: "flask",   color: "#7fd4e8" },
};

// Resource tile types (what drills / manual mining yield)
const RESOURCES = {
  ironOre:   { tileColor: "#43596e", needsTech: null },
  copperOre: { tileColor: "#6e5138", needsTech: null },
  coal:      { tileColor: "#30363e", needsTech: null },
  stone:     { tileColor: "#575048", needsTech: null },
  crystal:   { tileColor: "#2c5e6b", needsTech: "crystalDrilling" },
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
};

// Techs. Repeatable ones have costGrowth (cost = base * growth^level).
const TECHS = {
  drillSpeed:    { name: "Drill Velocity",   icon: "drill",   repeat: true,  baseCost: 10,  costGrowth: 3, effect: "Drills work 50% faster per level", mult: 1.5 },
  smeltSpeed:    { name: "Hotter Furnaces",  icon: "smelter", repeat: true,  baseCost: 10,  costGrowth: 3, effect: "Smelters work 50% faster per level", mult: 1.5 },
  craftSpeed:    { name: "Servo Arms",       icon: "assembler", repeat: true, baseCost: 10, costGrowth: 3, effect: "Assemblers work 50% faster per level", mult: 1.5 },
  labSpeed:      { name: "Peer Review",      icon: "lab",     repeat: true,  baseCost: 15,  costGrowth: 3, effect: "Labs work 50% faster per level", mult: 1.5 },
  manualMining:  { name: "Powered Picks",    icon: "mine",    repeat: true,  baseCost: 5,   costGrowth: 3, effect: "Manual mining yields x2 per level", mult: 2 },
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
