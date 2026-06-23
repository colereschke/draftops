import { useState, useMemo } from "react";

const RAW = [
  // QBs - val2QB from CSV, scaled 5x to $1000
  ["Drake Maye","NE","QB",23.8,1,52,""],
  ["Josh Allen","BUF","QB",30.1,2,51,""],
  ["Jayden Daniels","WFT","QB",25.5,5,44,""],
  ["Lamar Jackson","BAL","QB",29.5,6,42,""],
  ["Caleb Williams","CHI","QB",24.6,7,41,""],
  ["Jaxson Dart","NYG","QB",23.1,16,31,""],
  ["Justin Herbert","LAC","QB",28.3,20,30,""],
  ["Joe Burrow","CIN","QB",29.6,23,28,""],
  ["Bo Nix","DEN","QB",26.3,26,25,""],
  ["Jalen Hurts","PHI","QB",27.9,27,25,"Philly time may be ending"],
  ["Patrick Mahomes","KC","QB",30.8,35,20,"ACL recovery going well"],
  ["Fernando Mendoza","LV","QB",22.7,36,19,"Rookie — Kubiak/Bowers/Jeanty setup"],
  ["Trevor Lawrence","JAC","QB",26.7,40,19,""],
  ["Jordan Love","GB","QB",27.7,43,19,""],
  ["Brock Purdy","SF","QB",26.5,44,18,""],
  ["Cam Ward","TEN","QB",24.1,47,18,"Rookie. Daboll helps development"],
  ["Sam Darnold","SEA","QB",29.1,52,16,"SB win = job security"],
  ["Kyler Murray","MIN","QB",28.9,66,14,"Ideal landing spot"],
  ["Tyler Shough","NO","QB",26.8,65,14,""],
  ["Dak Prescott","DAL","QB",32.9,57,15,"Age concern"],
  ["C.J. Stroud","HOU","QB",24.7,70,12,"Make-or-break year"],
  ["Jared Goff","DET","QB",31.7,71,12,""],
  ["Malik Willis","MIA","QB",27.1,89,9,""],
  ["Baker Mayfield","TB","QB",31.2,74,11,"Extension talks ongoing"],
  ["Michael Penix Jr.","ATL","QB",26.1,158,3,"Tua may have job to start"],
  ["Bryce Young","CAR","QB",24.9,111,6,"5th-year option"],
  ["Ty Simpson","LAR","QB",23.5,112,6,"Rookie. Blocked but intriguing McVay QB"],
  ["Carson Beck","ARI","QB",23.6,171,3,"Rookie. Some starts likely"],
  ["Geno Smith","NYJ","QB",35.7,151,3,"Should start"],
  ["Tua Tagovailoa","ATL","QB",28.3,117,5,"Expecting to start majority of games"],
  ["Justin Fields","—","QB",27.0,200,2,""],
  ["Daniel Jones","IND","QB",29.1,106,7,"Short-term, major injury"],
  ["J.J. McCarthy","MIN","QB",23.4,214,1,"Probably cooked with Kyler in building"],
  ["Drew Allar","PIT","QB",22.3,231,1,"Rookie. Young w/ experience"],
  ["Cade Klubnik","NYJ","QB",22.7,232,1,"Rookie. Some PT possible"],
  ["Jalen Milroe","SEA","QB",23.5,275,1,""],
  ["Shedeur Sanders","CLE","QB",24.4,248,1,""],
  ["Taylen Green","CLE","QB",23.7,223,1,"Rookie. Athletic w/ solid peripherals"],
  ["Cole Payton","PHI","QB",23.7,225,1,"Rookie. Hurts displacement upside"],
  // RBs
  ["Bijan Robinson","ATL","RB",24.4,8,40,""],
  ["Jahmyr Gibbs","DET","RB",24.3,9,39,""],
  ["Jeremiyah Love","ARI","RB",21.1,17,31,"Rookie. Elite talent, crowded BF"],
  ["Ashton Jeanty","LV","RB",22.6,19,30,"Year 2 setup looks great"],
  ["Devon Achane","MIA","RB",24.7,22,28,""],
  ["Jonathan Taylor","IND","RB",27.4,30,24,""],
  ["Omarion Hampton","LAC","RB",23.3,33,22,"Touch share concern"],
  ["Kenneth Walker III","KC","RB",25.7,49,17,"Explosive, tough box situations"],
  ["James Cook","BUF","RB",26.8,42,19,""],
  ["Breece Hall","NYJ","RB",25.1,50,16,"More stability w/ Geno"],
  ["Jadarian Price","SEA","RB",22.7,51,16,"Rookie. Could dominate backfield early"],
  ["Saquon Barkley","PHI","RB",29.4,82,10,""],
  ["Travis Etienne","NO","RB",27.4,84,10,"Bellcow upside in rising offense"],
  ["Bucky Irving","TB","RB",23.9,81,10,"Committee + injury concerns"],
  ["Cam Skattebo","NYG","RB",24.4,86,10,"Major injury recovery"],
  ["Chase Brown","CIN","RB",26.3,88,9,"Perine earned late-season work"],
  ["Josh Jacobs","GB","RB",28.4,90,9,"League discipline concern"],
  ["Treveyon Henderson","NE","RB",23.7,73,11,""],
  ["Quinshon Judkins","CLE","RB",22.7,75,11,"Coming off major injury"],
  ["Javonte Williams","DAL","RB",26.2,77,11,"Extension in place"],
  ["RJ Harvey","DEN","RB",25.4,103,7,"Unlikely to solo this backfield"],
  ["Kyren Williams","LAR","RB",25.8,104,7,"Split getting tighter"],
  ["Bhayshul Tuten","JAC","RB",23.4,105,7,""],
  ["Derrick Henry","BAL","RB",32.5,98,8,"Age flag"],
  ["Christian McCaffrey","SF","RB",30.1,78,10,"Age flag"],
  ["Jordan Addison","MIN","RB",24.4,83,10,"WR — arrest adds long-term concern"],
  ["Blake Corum","LAR","RB",25.6,124,5,""],
  ["Kyle Monangai","CHI","RB",24.3,138,4,""],
  ["Kenny Gainwell","TB","RB",27.3,141,4,"Multi-RB role"],
  ["Jonah Coleman","DEN","RB",22.9,142,4,"Rookie. Long-term Dobbins replacement"],
  ["Zach Charbonnet","SEA","RB",25.5,146,3,"Late-season ACL"],
  ["Jonathon Brooks","CAR","RB",22.9,147,3,"Looked good in camp"],
  ["D'Andre Swift","CHI","RB",27.5,160,3,""],
  ["Chuba Hubbard","CAR","RB",27.0,161,3,"Two-man BF w/ Brooks"],
  ["Tyler Allgeier","ARI","RB",26.2,172,3,""],
  ["Rachaad White","WFT","RB",27.5,166,3,""],
  ["David Montgomery","HOU","RB",29.1,154,3,"Power complement to Marks"],
  ["Rhamondre Stevenson","NE","RB",28.3,156,3,""],
  ["Jordan Mason","MIN","RB",27.1,157,3,"Jones paycut may mean bigger role"],
  ["J.K. Dobbins","DEN","RB",27.5,176,2,"Split shifting to Harvey?"],
  ["Keaton Mitchell","LAC","RB",24.4,181,2,""],
  ["Rico Dowdle","PIT","RB",28.5,199,2,"Crowded backfield"],
  ["Tyjae Spears","TEN","RB",25.0,202,2,"Pass-catching role threatened by Singleton"],
  ["Nick Singleton","TEN","RB",22.5,190,2,"Rookie. Pollard cut candidate"],
  ["Mike Washington","LV","RB",23.0,193,2,"Rookie. Blocked by Jeanty"],
  ["Kaytron Allen","WFT","RB",23.5,204,1,"Rookie"],
  ["Kaelon Black","SF","RB",24.7,205,1,"Rookie. SF reach pick"],
  ["Emmett Johnson","KC","RB",22.7,207,1,"Rookie"],
  ["Aaron Jones","MIN","RB",31.6,208,1,""],
  ["Tony Pollard","TEN","RB",29.2,209,1,"Cut candidate"],
  ["Jaylen Warren","PIT","RB",27.7,212,1,""],
  ["Adam Randall","BAL","RB",22.0,215,1,"Rookie. Freaky athlete at 232 lbs"],
  ["Dylan Sampson","CLE","RB",21.8,218,1,""],
  ["Demond Claiborne","MIN","RB",22.7,220,1,"Rookie. Strong pass-catching background"],
  ["Kaleb Johnson","PIT","RB",22.9,222,1,"Cooked after disaster rookie year"],
  ["Tyrone Tracy Jr.","NYG","RB",26.6,224,1,""],
  ["Jacory Croskey-Merritt","WFT","RB",25.2,229,1,""],
  ["Eli Heidenreich","PIT","RB",22.9,230,1,"Rookie. Upside in unsettled BF"],
  ["Sean Tucker","TB","RB",24.7,234,1,""],
  ["Jaydon Blue","DAL","RB",22.5,236,1,""],
  ["Jaylen Wright","MIA","RB",23.2,241,1,""],
  ["Jarquez Hunter","LAR","RB",23.5,243,1,""],
  ["Jordan James","SF","RB",22.2,247,1,""],
  ["Marshawn Lloyd","GB","RB",25.5,267,1,"Will he ever stay healthy?"],
  ["Isiah Pacheco","DET","RB",27.3,269,1,""],
  ["Trevor Etienne","CAR","RB",22.0,271,1,""],
  ["Kimani Vidal","LAC","RB",24.8,273,1,""],
  ["Kendre Miller","NO","RB",24.0,274,1,""],
  // WRs
  ["Ja'Marr Chase","CIN","WR",26.3,3,49,""],
  ["Jaxon Smith-Njigba","SEA","WR",24.4,4,47,""],
  ["Puka Nacua","LAR","WR",25.1,10,38,"Tyson Zone right now"],
  ["Justin Jefferson","MIN","WR",27.0,12,36,"Kyler = massive QB upgrade"],
  ["Amon-Ra St. Brown","DET","WR",26.7,13,34,""],
  ["Drake London","ATL","WR",24.9,15,32,""],
  ["Tetairoa McMillan","CAR","WR",23.2,18,30,"Rookie"],
  ["CeeDee Lamb","DAL","WR",27.2,21,29,""],
  ["Malik Nabers","NYG","WR",22.9,25,25,"Injury timeline concern"],
  ["George Pickens","DAL","WR",25.3,28,25,"Franchise tag, trade rumors"],
  ["Emeka Egbuka","TB","WR",23.7,29,24,"Go-to with Evans gone"],
  ["Brian Thomas Jr.","JAC","WR",23.7,31,24,""],
  ["Jameson Williams","DET","WR",25.3,32,23,""],
  ["Nico Collins","HOU","WR",27.3,37,19,""],
  ["Rome Odunze","CHI","WR",24.1,38,19,""],
  ["Luther Burden","CHI","WR",22.5,39,19,""],
  ["Carnell Tate","TEN","WR",21.4,41,19,"Rookie. Immediate go-to upside"],
  ["Jordyn Tyson","NO","WR",21.9,45,18,"Rookie. Injury history concern"],
  ["KC Concepcion","CLE","WR",21.8,46,18,"Rookie. Electric in space"],
  ["Makai Lemon","PHI","WR",22.1,48,17,"Rookie. AJB replacement"],
  ["Ladd McConkey","LAC","WR",24.6,53,15,""],
  ["Tee Higgins","CIN","WR",27.4,54,15,""],
  ["Zay Flowers","BAL","WR",25.8,56,15,""],
  ["Chris Olave","NO","WR",26.0,58,15,""],
  ["Garrett Wilson","NYJ","WR",25.9,60,15,"Best QB of career incoming"],
  ["Jaylen Waddle","DEN","WR",27.6,61,14,""],
  ["DeVonta Smith","PHI","WR",27.6,62,14,""],
  ["A.J. Brown","NE","WR",29.0,63,14,""],
  ["Christian Watson","GB","WR",27.1,64,14,""],
  ["Alec Pierce","IND","WR",26.2,67,14,"20+ YPR last 2 seasons"],
  ["Rashee Rice","KC","WR",26.2,68,13,"Character concern"],
  ["Marvin Harrison Jr.","ARI","WR",23.9,69,13,""],
  ["DK Metcalf","PIT","WR",28.5,72,12,""],
  ["Matthew Golden","GB","WR",22.9,76,11,"Clearing path for more PT"],
  ["Ricky Pearsall","SF","WR",25.8,78,10,""],
  ["Xavier Worthy","KC","WR",23.2,93,9,""],
  ["Jayden Higgins","HOU","WR",23.5,94,9,""],
  ["Omar Cooper","NYJ","WR",22.5,96,8,"Rookie. Crowded but explosive"],
  ["Travis Hunter","JAC","WR",23.1,107,6,"Recovering from injury"],
  ["Denzel Boston","CLE","WR",22.6,108,6,"Rookie. Red zone upside"],
  ["Parker Washington","JAC","WR",24.3,109,6,""],
  ["Wan'Dale Robinson","TEN","WR",25.5,110,6,"Expected to lead TEN targets"],
  ["DeZhaun Stribling","SF","WR",23.5,101,7,"Rookie. Pick 33 reach but ceiling"],
  ["Quentin Johnston","LAC","WR",24.8,115,5,""],
  ["Jayden Reed","GB","WR",26.2,118,5,"Extended for less than Wan'Dale"],
  ["Elic Ayomanor","TEN","WR",23.0,119,5,""],
  ["Tre Harris","LAC","WR",24.3,120,5,""],
  ["Kyle Williams","NE","WR",23.6,121,5,""],
  ["Mike Evans","SF","WR",32.9,123,5,"Age flag"],
  ["Antonio Williams","WFT","WR",22.0,125,5,"Rookie. Clemson breakout, slot upside"],
  ["Josh Downs","IND","WR",24.9,126,5,""],
  ["Romeo Doubs","NE","WR",26.2,127,5,"Secondary target w/ AJB in building"],
  ["Chimere Dike","TEN","WR",23.5,128,5,""],
  ["Chris Bell","MIA","WR",22.1,129,4,"Rookie. Patient investment"],
  ["Chris Godwin","TB","WR",30.3,130,4,""],
  ["Terry McLaurin","WFT","WR",30.8,131,4,""],
  ["Courtland Sutton","DEN","WR",30.7,132,4,""],
  ["Jaylin Noel","HOU","WR",23.8,133,4,""],
  ["Khalil Shakir","BUF","WR",26.4,134,4,""],
  ["Stefon Diggs","FA","WR",32.6,135,4,"Cut at 32 post-SB"],
  ["Germie Bernard","PIT","WR",22.6,136,4,"Rookie. Classic Day 2 Steelers WR"],
  ["Chris Brazzell","CAR","WR",22.7,137,4,"Rookie. Vertical threat for McMillan"],
  ["Keon Coleman","BUF","WR",23.1,139,4,""],
  ["Zachariah Branch","ATL","WR",22.2,140,4,"Rookie. Screen merchant, tough fit"],
  ["Ted Hurst","TB","WR",22.0,143,4,"Rookie. Possible immediate starter"],
  ["Malachi Fields","NYG","WR",24.0,144,4,"Rookie. Power forward WR"],
  ["Jakobi Meyers","JAC","WR",29.6,145,3,""],
  ["Rashid Shaheed","SEA","WR",27.8,159,3,""],
  ["Ja'Kobi Lane","BAL","WR",21.9,162,3,"Rookie. Early breakout"],
  ["Elijah Sarratt","BAL","WR",23.1,163,3,"Rookie. 15 TDs in NCG season"],
  ["Deebo Samuel","FA","WR",30.5,164,3,""],
  ["Tyreek Hill","FA","WR",32.3,165,3,""],
  ["Jalen McMillan","TB","WR",24.6,167,3,""],
  ["Skyler Bell","BUF","WR",24.0,168,3,"Rookie. Elite agility testing"],
  ["Adonai Mitchell","NYJ","WR",23.7,169,3,""],
  ["Brandon Aiyuk","SF","WR",28.3,183,2,"Potential future Commander?"],
  ["Pat Bryant","DEN","WR",23.5,184,2,""],
  ["Isaac TeSlaa","DET","WR",24.4,185,2,""],
  ["Isaiah Bond","CLE","WR",22.3,188,2,""],
  ["Caleb Douglas","MIA","WR",22.8,173,2,"Rookie. Opportunity abounds"],
  ["Kayshon Boutte","NE","WR",24.1,174,2,""],
  ["Troy Franklin","DEN","WR",23.4,175,2,""],
  ["Michael Pittman Jr.","PIT","WR",28.7,152,3,"Needs QB upgrade to bounce back"],
  ["Jauan Jennings","MIN","WR",29.0,153,3,""],
  ["DJ Moore","BUF","WR",29.2,91,9,"On decline but best BUF WR"],
  ["Davante Adams","LAR","WR",33.5,92,9,""],
  ["Zavion Thomas","CHI","WR",21.8,220,1,"Rookie. Blazing fast, ST/WR role"],
  ["Jalen Coker","CAR","WR",24.7,246,1,""],
  ["Bryce Lance","NO","WR",24.8,249,1,"Rookie. Shredded combine"],
  ["Tre Tucker","LV","WR",25.3,250,1,""],
  ["Tory Horton","SEA","WR",23.6,251,1,"Injury may linger into 2026"],
  ["Keenan Allen","FA","WR",34.2,253,1,""],
  ["Nathaniel Dell","HOU","WR",26.7,254,1,""],
  ["Jerry Jeudy","CLE","WR",27.2,255,1,""],
  ["Marquise Brown","PHI","WR",29.1,257,1,"Interesting w/ AJB trade rumors"],
  ["Dontayvion Wicks","PHI","WR",25.0,259,1,""],
  ["Luke McCaffrey","WFT","WR",25.2,262,1,""],
  ["Jaylin Lane","WFT","WR",24.2,263,1,""],
  ["Brenen Thompson","LAC","WR",22.9,264,1,"Rookie"],
  ["Malik Benson","LV","WR",23.7,266,1,"Rookie"],
  ["Jack Bech","LV","WR",23.5,270,1,""],
  ["Marvin Mims","DEN","WR",24.3,290,1,""],
  ["Malik Washington","MIA","WR",25.5,291,1,""],
  // TEs
  ["Brock Bowers","LV","TE",23.5,11,37,"TE premium boosts ceiling significantly"],
  ["Trey McBride","ARI","TE",26.6,14,33,""],
  ["Colston Loveland","CHI","TE",22.2,24,25,"Young with massive ceiling"],
  ["Tyler Warren","IND","TE",24.1,34,20,""],
  ["Harold Fannin","CLE","TE",22.9,55,15,"No longer blocked by Njoku"],
  ["Kenyon Sadiq","NYJ","TE",21.3,87,10,"Rookie. More receiver than TE"],
  ["Tucker Kraft","GB","TE",25.6,94,9,""],
  ["Sam LaPorta","DET","TE",25.5,97,8,""],
  ["Kyle Pitts","ATL","TE",25.7,99,8,""],
  ["Isaiah Likely","NYG","TE",25.6,100,7,"Young — Wandale replacement?"],
  ["Oronde Gadsden","LAC","TE",23.0,102,7,""],
  ["Eli Stowers","PHI","TE",23.2,114,6,"Rookie. Long-term answer in Philly"],
  ["Eli Raridon","NE","TE",22.4,122,5,"Rookie. Top young QB upside"],
  ["Dalton Kincaid","BUF","TE",26.7,116,5,""],
  ["Max Klare","LAR","TE",23.0,148,3,"Rookie"],
  ["Oscar Delp","NO","TE",23.0,150,3,"Rookie. Sub 4.5 speed"],
  ["Jake Ferguson","DAL","TE",27.4,155,3,""],
  ["Terrance Ferguson","LAR","TE",23.4,170,3,""],
  ["Chigoziem Okonkwo","WFT","TE",26.8,178,2,""],
  ["Brenton Strange","JAC","TE",25.5,180,2,""],
  ["George Kittle","SF","TE",32.7,182,2,"Achilles recovery concern"],
  ["Hunter Henry","NE","TE",31.6,192,2,""],
  ["T.J. Hockenson","MIN","TE",29.0,194,2,""],
  ["Cade Otton","TB","TE",27.2,195,2,""],
  ["Elijah Arroyo","SEA","TE",23.2,196,2,""],
  ["Gunnar Helm","TEN","TE",23.8,197,2,"Flashed as rookie, no Chig now"],
  ["Mason Taylor","NYJ","TE",22.1,198,2,"Traditional Y TE, tough for fantasy"],
  ["AJ Barner","SEA","TE",24.2,200,2,""],
  ["Juwan Johnson","NO","TE",29.8,201,2,"Competition added despite good season"],
  ["Mark Andrews","BAL","TE",30.8,203,1,""],
  ["Dallas Goedert","PHI","TE",31.5,210,1,""],
  ["Pat Freiermuth","PIT","TE",27.7,213,1,""],
  ["Darnell Washington","PIT","TE",24.9,217,1,""],
  ["Matthew Hibner","BAL","TE",24.3,218,1,"Rookie"],
  ["Justin Joly","DEN","TE",22.0,233,1,"Rookie"],
  ["Sam Roush","CHI","TE",22.8,235,1,"Rookie"],
  ["David Njoku","LAC","TE",30.0,226,1,"Contract not impressive"],
  ["Theo Johnson","NYG","TE",25.3,227,1,""],
  ["Colby Parkinson","LAR","TE",27.5,228,1,""],
  ["Travis Kelce","KC","TE",36.7,239,1,"One last ride?"],
  ["Evan Engram","DEN","TE",31.8,245,1,""],
  ["Josh Cuevas","BAL","TE",22.8,252,1,"Rookie"],
  // Pick Packages
  ["2027 Pick Package (Kicker bid)","NFL","PKG",null,59,19,"Nets 2027 1st+2nd+3rd. Speculative SF premium expected"],
  ["2028 Pick Package","NFL","PKG",null,85,13,"Nets 2028 1st+2nd+3rd"],
  // Individual picks for reference
  ["2027 1st Round Pick","NFL","PICK",null,59,15,"Part of kicker pick package"],
  ["2027 2nd Round Pick","NFL","PICK",null,148,3,"Part of kicker pick package"],
  ["2027 3rd Round Pick","NFL","PICK",null,215,1,"Part of kicker pick package"],
  ["2028 1st Round Pick","NFL","PICK",null,85,10,""],
  ["2028 2nd Round Pick","NFL","PICK",null,177,2,""],
  ["2028 3rd Round Pick","NFL","PICK",null,237,1,""],
];

const SCALE = 5;
const TE_PREMIUM = 1.18;
const PKG_PREMIUM = 1.15; // speculative SF package premium

const players = RAW.map(([player, team, pos, age, sfRank, val2QB, notes]) => {
  let base = Math.round(val2QB * SCALE);
  if (pos === "TE") base = Math.round(base * TE_PREMIUM);
  if (pos === "PKG") base = Math.round(base * SCALE * PKG_PREMIUM); // already raw, re-scale
  const ceiling = Math.round(base * 1.15);
  const floor = Math.max(5, Math.round(base * 0.87));
  return { player, team, pos, age, sfRank, budget: base, ceiling, floor, notes };
});

// Fix PKG - it was double-scaled, recalculate manually
// 2027: 1st($75)+2nd($15)+3rd($5) = $95 * 1.15 premium = ~$109
// 2028: 1st($50)+2nd($10)+3rd($5) = $65 * 1.1 = ~$72

const fixedPlayers = players.map(p => {
  if (p.player.includes("2027 Pick Package")) {
    const v = 109;
    return { ...p, budget: v, ceiling: Math.round(v * 1.20), floor: 75 };
  }
  if (p.player.includes("2028 Pick Package")) {
    const v = 72;
    return { ...p, budget: v, ceiling: Math.round(v * 1.20), floor: 50 };
  }
  return p;
});

const POS_COLORS = {
  QB: { bg: "#1a2744", accent: "#4f83e8", badge: "#e8f0fe", badgeText: "#1a2744" },
  RB: { bg: "#1a2e1a", accent: "#4caf6e", badge: "#e6f4ea", badgeText: "#1a3a22" },
  WR: { bg: "#2a1f0e", accent: "#e8a030", badge: "#fef3e2", badgeText: "#3a2008" },
  TE: { bg: "#2a1a2a", accent: "#c060d0", badge: "#f5e6f8", badgeText: "#3a0a3a" },
  PICK: { bg: "#1a2a2a", accent: "#40b0b0", badge: "#e0f5f5", badgeText: "#0a3030" },
  PKG: { bg: "#2a2010", accent: "#f0c040", badge: "#fdf5d0", badgeText: "#3a2a00" },
};

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "PICK", "PKG"];

export default function AuctionSheet() {
  const [posFilter, setPosFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("sfRank");
  const [sortDir, setSortDir] = useState("asc");
  const [showNotes, setShowNotes] = useState(false);
  const [myBudget, setMyBudget] = useState(1000);
  const [spent, setSpent] = useState(0);

  const remaining = myBudget - spent;

  const filtered = useMemo(() => {
    let data = [...fixedPlayers];
    if (posFilter !== "ALL") data = data.filter(p => p.pos === posFilter);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(p => p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }
    data.sort((a, b) => {
      let aV = a[sortBy], bV = b[sortBy];
      if (aV === null || aV === undefined) aV = 9999;
      if (bV === null || bV === undefined) bV = 9999;
      if (typeof aV === "string") aV = aV.toLowerCase();
      if (typeof bV === "string") bV = bV.toLowerCase();
      if (aV < bV) return sortDir === "asc" ? -1 : 1;
      if (aV > bV) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return data;
  }, [posFilter, search, sortBy, sortDir]);

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir(col === "sfRank" || col === "player" ? "asc" : "desc"); }
  };

  const SortIcon = ({ col }) => sortBy !== col
    ? <span style={{ color: "#444", marginLeft: 3 }}>↕</span>
    : <span style={{ color: "#e8a030", marginLeft: 3 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;

  const posStats = useMemo(() => {
    const stats = {};
    ["QB","RB","WR","TE"].forEach(pos => {
      const pp = fixedPlayers.filter(p => p.pos === pos);
      stats[pos] = { count: pp.length, total: pp.reduce((s,p) => s + p.budget, 0) };
    });
    return stats;
  }, []);

  const grandTotal = Object.values(posStats).reduce((s,v) => s + v.total, 0);

  const ageColor = age => {
    if (age === null) return "#444";
    if (age <= 24) return "#4caf6e";
    if (age <= 27) return "#e8e8e8";
    if (age <= 30) return "#e8a030";
    return "#e05050";
  };

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',sans-serif", background: "#0d0f14", minHeight: "100vh", color: "#e8e8e8" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0d0f14 0%,#141824 100%)", borderBottom: "1px solid #2a2e3a", padding: "18px 20px 14px" }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#666", textTransform: "uppercase", marginBottom: 3 }}>
          12-Team · Superflex · TE Premium · $1,000 Budget · 30-Man Rosters
        </div>
        <h1 style={{ margin: "0 0 2px", fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>
          Startup Auction Value Sheet
        </h1>
        <div style={{ fontSize: 11, color: "#555" }}>
          2QB rankings scaled 5× · TE PPR+1 / 1st Down+0.25 applied · {fixedPlayers.filter(p => !["PKG","PICK"].includes(p.pos)).length} players + pick assets
        </div>

        {/* Budget tracker */}
        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ background: "#1a1d26", borderRadius: 8, padding: "8px 14px", display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase" }}>Budget</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#4f83e8" }}>${myBudget}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase" }}>Spent</div>
              <input
                type="number"
                value={spent}
                onChange={e => setSpent(Math.max(0, parseInt(e.target.value) || 0))}
                style={{ width: 70, fontSize: 18, fontWeight: 700, color: "#e8a030", background: "transparent", border: "none", outline: "none", textAlign: "center" }}
              />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase" }}>Remaining</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: remaining < 100 ? "#e05050" : "#4caf6e" }}>${remaining}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#555", maxWidth: 200 }}>
            ↑ Track your spend to know who can still hurt you in the room
          </div>
        </div>

        {/* Budget bar by position */}
        <div style={{ marginTop: 12, background: "#1a1d26", borderRadius: 8, padding: "8px 12px" }}>
          <div style={{ fontSize: 10, color: "#555", marginBottom: 5, letterSpacing: 1, textTransform: "uppercase" }}>Market weight by position</div>
          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 1 }}>
            {["QB","RB","WR","TE"].map(pos => {
              const pct = (posStats[pos].total / grandTotal * 100).toFixed(1);
              return <div key={pos} style={{ width: `${pct}%`, background: POS_COLORS[pos].accent, opacity: 0.8 }} />;
            })}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 5 }}>
            {["QB","RB","WR","TE"].map(pos => {
              const pct = (posStats[pos].total / grandTotal * 100).toFixed(0);
              return (
                <div key={pos} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: POS_COLORS[pos].accent }} />
                  <span style={{ color: "#888" }}>{pos}</span>
                  <span style={{ color: "#555" }}>{pct}% · ${posStats[pos].total}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: "12px 20px", background: "#0f1118", borderBottom: "1px solid #1e2130", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {POSITIONS.map(pos => {
            const c = POS_COLORS[pos] || POS_COLORS.PICK;
            const active = posFilter === pos;
            return (
              <button key={pos} onClick={() => setPosFilter(pos)} style={{
                padding: "4px 10px", borderRadius: 5, border: "1px solid",
                fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: 0.5,
                borderColor: active ? (c.accent || "#e8a030") : "#2a2e3a",
                background: active ? (c.bg || "#1a1d26") : "transparent",
                color: active ? (c.accent || "#e8a030") : "#555",
              }}>{pos}</button>
            );
          })}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search player or team..."
          style={{ background: "#1a1d26", border: "1px solid #2a2e3a", borderRadius: 5, padding: "4px 10px", color: "#e8e8e8", fontSize: 12, outline: "none", width: 180 }}
        />
        <button onClick={() => setShowNotes(n => !n)} style={{
          padding: "4px 10px", borderRadius: 5, border: "1px solid #2a2e3a",
          background: showNotes ? "#2a2e3a" : "transparent", color: showNotes ? "#e8e8e8" : "#555", fontSize: 11, cursor: "pointer"
        }}>{showNotes ? "Hide Notes" : "Show Notes"}</button>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#444" }}>{filtered.length} players shown</div>
      </div>

      {/* Legend */}
      <div style={{ padding: "6px 20px", background: "#0a0c10", borderBottom: "1px solid #1a1d26", display: "flex", gap: 18, fontSize: 10, color: "#444", flexWrap: "wrap" }}>
        <span>🔻 <b style={{ color: "#666" }}>Floor</b> = steal territory</span>
        <span>💰 <b style={{ color: "#666" }}>Target</b> = calibrated bid</span>
        <span>🔺 <b style={{ color: "#666" }}>Ceiling</b> = hard stop</span>
        <span style={{ borderLeft: "1px solid #222", paddingLeft: 18 }}>
          Age: <span style={{ color: "#4caf6e" }}>≤24</span> <span style={{ color: "#e8e8e8" }}>25–27</span> <span style={{ color: "#e8a030" }}>28–30</span> <span style={{ color: "#e05050" }}>31+</span>
        </span>
        <span><b style={{ color: "#e8a030", fontSize: 9 }}>R</b> = Rookie · <b style={{ color: "#f0c040", fontSize: 9 }}>PKG</b> = 2027 1st+2nd+3rd via kicker bid</span>
      </div>

      {/* Table */}
      <div style={{ padding: "0 20px 40px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2a2e3a" }}>
              {[
                { key: "sfRank", label: "SF Rank" },
                { key: "player", label: "Player" },
                { key: "pos", label: "Pos" },
                { key: "team", label: "Team" },
                { key: "age", label: "Age" },
                { key: "floor", label: "🔻 Floor" },
                { key: "budget", label: "💰 Target" },
                { key: "ceiling", label: "🔺 Ceiling" },
              ].map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)} style={{
                  padding: "9px 10px", textAlign: col.key === "player" ? "left" : "center",
                  fontSize: 10, fontWeight: 600, letterSpacing: 1, color: sortBy === col.key ? "#e8a030" : "#444",
                  textTransform: "uppercase", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap"
                }}>
                  {col.label}<SortIcon col={col.key} />
                </th>
              ))}
              {showNotes && <th style={{ padding: "9px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "#444", textTransform: "uppercase", letterSpacing: 1 }}>Notes</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const c = POS_COLORS[p.pos] || POS_COLORS.PICK;
              const isRookie = p.notes.toLowerCase().includes("rookie");
              const isPkg = p.pos === "PKG";
              return (
                <tr key={p.player + i}
                  style={{ borderBottom: "1px solid #141720", background: i % 2 === 0 ? "transparent" : "#0a0c10" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#141824"}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "#0a0c10"}
                >
                  <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, color: "#444", fontVariantNumeric: "tabular-nums" }}>
                    {p.sfRank}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: isPkg ? 700 : 600, color: isPkg ? "#f0c040" : "#e8e8e8" }}>{p.player}</span>
                      {isRookie && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, background: "#3a2800", color: "#e8a030", borderRadius: 3, padding: "1px 4px", textTransform: "uppercase" }}>R</span>}
                      {isPkg && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, background: "#3a2a00", color: "#f0c040", borderRadius: 3, padding: "1px 4px", textTransform: "uppercase" }}>PKG</span>}
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    <span style={{ display: "inline-block", background: c.badge, color: c.badgeText, borderRadius: 4, fontSize: 9, fontWeight: 700, padding: "2px 6px", letterSpacing: 0.5 }}>
                      {p.pos}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, color: "#777" }}>{p.team}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontVariantNumeric: "tabular-nums", color: ageColor(p.age) }}>
                    {p.age !== null ? p.age.toFixed(1) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    <span style={{ fontSize: 12, color: "#666", fontVariantNumeric: "tabular-nums" }}>${p.floor}</span>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: c.accent, fontVariantNumeric: "tabular-nums" }}>${p.budget}</span>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    <span style={{ fontSize: 12, color: "#e05050", fontVariantNumeric: "tabular-nums" }}>${p.ceiling}</span>
                  </td>
                  {showNotes && (
                    <td style={{ padding: "8px 10px", fontSize: 10, color: "#555", maxWidth: 220 }}>{p.notes || "—"}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "10px 20px", borderTop: "1px solid #1a1d26", fontSize: 10, color: "#333", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>Source: 2QB auction values (FantasyCalc CSV) scaled 5× to $1,000 budget · TE premium ~18% applied</span>
        <span style={{ marginLeft: "auto" }}>PKG target for 2027 kicker = $109 (1st+2nd+3rd bundled w/ SF speculative premium)</span>
      </div>
    </div>
  );
}
