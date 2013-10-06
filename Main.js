var mapChoice = "tutorial_m1_OM"; //Set to a JSON flag later

var mapInitialized = false;	// Flag of whether or not we've cleaned up the map for play

var blockingError = false;	// Flag; if set to true, plugin should do nothing at all, allowing normal play
				// only set if something happens that completely prevents plugin action

var MC;				// The map configuration file
var DBGM = keyvalue.parseKVFile("debugmappings.kv"); // A little additional file with debugging mappings TODO remove

var modelCache = {};		// Cache of models, as some aren't loaded on some maps

var timers = require('timers');

var dummyModel;

var morty;			// Morty the maintenance greevil; goes around and cuts trees for us, as well as various other things
var mortyChop;
var mortySaw;
var mortyFly;
var treesToTrim;		// Trees morty has to keep trimmed

var lasttt=-99999;
var lastff=-99999;
var trimmingtrees = 0;

doSetup();

// Initialization commands to prepare the server, load the map choice, and so on
function doSetup() {
	try {
		MC = keyvalue.parseKVFile(mapChoice+".kv");
	} catch(error) {
		debugprint("Atlas: Invalid map choice, falling back to default map...");
		debugprint("Atlas: Error was ("+error.message+")");
		blockingError=true;
		return;
	}
	game.hook("OnMapStart",onMapStart);
	game.hook("OnGameFrame",onGameFrame);
	game.hook("Dota_OnUnitThink",onUnitThink);
	game.hook("Dota_OnGetAbilityValue",onGetAbilityValue);
	console.addServerCommand("debug_byclass",debugByClass);
	console.addServerCommand("debug_tgtname",debugTargetNameChanges);
	console.addServerCommand("debug_ts",debugTreeSpots);

	// This allows us to hook at the very first moment it's ready
	var cv = console.findConVar('sv_hibernate_when_empty');
	cv.setBool(false);
}

function debugprint(str) {
	if(MC.debug!=0) {
		server.print(str);
	}
}

// Change the map
function forceMapChange(client,args) {
	if(server.getMap() != MC.MapFile) {
		server.changeMap(MC.MapFile,"Plugin Map Change");
		debugprint("Atlas: Map is "+server.getMap());
	}
}
function wrongMap() {
	return server.getMap() != MC.MapFile;
}
function pad(num) {
	return ("00"+num).slice(-3);
}
function onGameFrame() {
	// only will actually do something once, and this is the earlierst place to put it
	// note that normally this wouldn't run until players join, which is why we need to
	// disable sv_hibernate_when_empty
	forceMapChange();
}
function debugByClass(client,args) {
	debugprint(args[0]);
	var counter=0;
	var list = game.findEntitiesByClassname(args[0]);
	for(var qwop=0;qwop<list.length;qwop++) {
	//game.findEntitiesByClassname(args[0]).forEach(function(ent) {
		ent=list[qwop];
		debugprint((counter++)+": ");
		for(var o in ent) {
			if(o=="index") {
				debugprint("\t"+o+" : "+ent.index);
			} else {
				debugprint("\t"+o+" : ");
			}
		}
		debugprint("\t---");
		for(var o in ent.keyvalues) {
			debugprint("\t"+o+" : "+ent.keyvalues[o]);
		}
		debugprint("\t---");
		offset=0;
		for(var i=0;i<32;i++) {
			var str = "";
			for(var j=0;j<16;j++) {
				if(qwop==0 || ent.getData(offset,1) == list[qwop-1].getData(offset,1)) {
					str = str + " " + DBGM['bytemapping'][ent.getData(offset,1)];
				} else {
					str = str + "_" + DBGM['bytemapping'][ent.getData(offset,1)];
				}
				//str = str + " "+mapping[ent.getData(offset,1)];
				offset=offset+1;
			}
			debugprint(str);
		}
		debugprint("\t---");
		for(var o in DBGM[args[0]]) {
			var res = ent.netprops[DBGM[args[0]][o]];
			if(res!=undefined && res!= 0)
				debugprint("\t"+DBGM[args[0]][o]+" : "+res);
		}
	}
	//});
}
function debugTargetNameChanges(client,args) {
	debugprint("Searching for entity named "+args[0]);
	var ent = game.findEntityByTargetname(args[0]);
	debugprint("Found one at ["+ent.netprops.m_vecOrigin[0]);
}
function debugTreeSpots(client,args) {
	var removearr = {};
	for(var o in MC.TreeTrim) {
		removearr[MC.TreeTrim[o][0]] = Array(MC.TreeTrim[o][0],MC.TreeTrim[o][1],MC.TreeTrim[o][2]);
	}
	server.print(JSON.stringify(removearr));
	game.findEntitiesByClassname("*").forEach(function(ent) {
		//server.print(JSON.stringify(ent.netprops.m_vecOrigin));
		for(var o in removearr) {
			//server.print(ent.getClassname());
			if(ent.netprops.m_vecOrigin == undefined)
				continue;
			if(Math.abs(ent.netprops.m_vecOrigin['x']- removearr[o][0])<100 && Math.abs(ent.netprops.m_vecOrigin['y'] - removearr[o][1]) < 100 && Math.abs(ent.netprops.m_vecOrigin['z'] - removearr[o][2]) < 100) {
				server.print(ent.getClassname());
				server.print("               : ("+ent.netprops.m_vecOrigin['x']+", "+ent.netprops.m_vecOrigin['y']+", "+ent.netprops.m_vecOrigin['z']+")");
				if(ent.netprops.m_hParent != undefined)
					server.print(ent.netprops.m_hParent.getClassname());
				if(ent.netprops.m_hGroundEntity != undefined)
					server.print(ent.netprops.m_hGroundEntity.getClassname());
				//dota.remove(ent);
				//ent.removeEdict();
				break;
			}
		}
	});
}

function spawnJungle(spawn, type, radius) {

}

function spawnRoshan(spawn) {
	var thisrosh = dota.createUnit("npc_dota_roshan",4);
	dota.findClearSpaceForUnit(thisrosh,spawn.netprops.m_vecOrigin);
}

function createBrushEntity(ename,name,x,y,z,minx,miny,minz,maxx,maxy,maxz) { // Doesn't seem to work atm...
	var area = game.createEntity(ename);
	area.netprops.m_fEffects     = 48;
	area.netprops.m_nModelIndex  = dummyModel;
	area.keyvalues.Name          = name;
	area.netprops.m_iName        = name;
	area.netprops.vecMins        = [minx,miny,minz];
	area.netprops.vecMaxs        = [maxx,maxy,maxz];
	area.netprops.m_nSolidType   = 2;
	area.teleport(x,y,z);
	return area;
}

function onUnitThink(unit) {
	if(unit != morty) {
		return;
	}
	dota.setUnitState(unit,dota.UNIT_STATE_NO_AUTOATTACKS,true);
	//dota.setUnitState(unit,dota.UNIT_STATE_SILENCED,true);
	dota.setUnitState(unit,dota.UNIT_STATE_INVULNERABLE,true);
	dota.setUnitState(unit,dota.UNIT_STATE_MAGIC_IMMUNE,true);
	dota.setUnitState(unit,dota.UNIT_STATE_NO_HEALTHBAR,true);
	dota.setUnitState(unit,dota.UNIT_STATE_PHASE,true);
	if(game.getTime() > 15+lastff) {
		dota.setUnitControllableByPlayer(morty, 0, true);
		dota.executeOrders(0,dota.ORDER_TYPE_CAST_ABILITY_NO_TARGET, [morty], null, mortyFly, false, morty.netprops.m_vecOrigin);
		dota.setUnitControllableByPlayer(morty, 0, false);	
		lastff = game.getTime();
		return;
	}
	if(game.getTime() > 15+lasttt) {
		trimmingtrees=0;
		lasttt=game.getTime();
	}
	if(trimmingtrees < treesToTrim.length-1) {
		var ent = treesToTrim[trimmingtrees++];
		morty.teleport(ent.netprops.m_vecOrigin);
	}
}

function onGetAbilityValue(ability, abilityName, field, values) {
	if(ability.netprops.m_hOwnerEntity == morty) {
		if(field=="damage_per_second" || field=="radius")
			return [0,0,0,0];
	}
}

function onMapStart(){
	// Don't do anything if we're on the wrong map :P
	if(wrongMap())return;

	if(!mapInitialized) {
		debugprint("Atlas Terraform: Starting");
		debugprint("Atlas Terraform: Spawning Maintenance Greevil");
		{
			//var mortyModel = game.precacheModel("models/creeps/mega_greevil/mega_greevil.mdl");
			morty = dota.createUnit("npc_dota_greevil_miniboss_purple",4);
			//morty.netprops.m_nModelIndex	= mortyModel;
			morty.netprops.m_bIsAncient	= 1;
			morty.netprops.m_bWakesNeutrals	= 0;
			morty.netprops.m_bConsideredHero= 1;
			morty.netprops.m_iszUnitName	= "Morty";
			morty.netprops.m_iName		= "Morty";
			morty.netprops.m_bHasInventory	= 1;
			morty.netprops.m_iMoveSpeed	= 0;
			morty.netprops.m_iCurrentLevel	= 42;
			morty.netprops.m_iAttackRange	= 0;
			morty.netprops.m_iAttackRangeBuffer	= 0;
			morty.netprops.m_iHasAggressiveStance	= 0;
			morty.netprops.m_flFollowRange	= 0;
			morty.netprops.m_iMaxHealth	= 8000;
			morty.netprops.m_iHealth	= 8000;
			mortySaw			= dota.createAbility(morty,'shredder_whirling_death');
			mortySaw.netprops.m_iLevel=1;
			dota.setAbilityByIndex(morty,mortySaw,0);
			mortyChop			= dota.createAbility(morty,'item_quelling_blade');
			dota.setAbilityByIndex(morty,mortyChop,3);
			mortyFly			= dota.createAbility(morty,'batrider_firefly');
			mortyFly.netprops.m_iLevel=1;
			game.hookEnt(mortyFly,2,function() {return 0;});
			game.hookEnt(mortyFly,7,function() {return 0;});
			game.hookEnt(mortyFly,8,function() {return 0;});//Sadly, doesn't actually work :/
			dota.setAbilityByIndex(morty,mortyFly,1);
			dota.giveItemToHero('item_quelling_blade',morty); // Morty does our landscaping
			morty.teleport(0,0,0);
		}
		debugprint("Atlas Terraform: Caching models");
		for(var o in MC.ModelsToCache) {
			modelCache[o]=game.precacheModel(MC.ModelsToCache[o],true);
			debugprint("               : Cached id "+modelCache[o]+" as ("+o+", "+MC.ModelsToCache[o]+")");
		}
		// Model to be used for creating brush entities; don't mind that brush entity creation doesn't actually work
		dummyModel = game.precacheModel("models/props_tree/tree_oak_01b.mdl",true);
		for(var o in MC.SendInputN) {
			debugprint("Atlas Terraform: Sending command to "+o);
			var ent = game.findEntityByTargetname(o);
			var data = MC.SendInputN[o];
			switch(data.length) {
				case 1:
					ent.input(data[0]);
					break;
				/*case 2:
					ent.input(data[0], array(data[1]));
					break;
				case 3:
					ent.input(data[0], data[1], game.findEntityByTargetname(data[2]));
					break;
				case 4:
					ent.input(data[0], data[1], game.findEntityByTargetname(data[2]), game.findEntityByTargetname(data[3]));
					break;*/
			}
		}
		/*dota.removeAll("npc_dota_neutral_spawner");
		game.findEntitiesByClassname("npc_dota_neutral_spawner").forEach(function(ent){
			dota.remove(ent);
			ent.removeEdict();
		});*/
		{
			debugprint("Atlas Terraform: Creating Gardening Routine");
			treesToTrim = [];
			var removearr = {};
			for(var o in MC.TreeTrim) {
				removearr[MC.TreeTrim[o][0]] = Array(MC.TreeTrim[o][0],MC.TreeTrim[o][1],MC.TreeTrim[o][2]);
			}
			var counter=0;
			game.findEntitiesByClassname("ent_dota_tree").forEach(function(ent) {
				for(var o in removearr) {
					if(Math.abs(ent.netprops.m_vecOrigin['x']- removearr[o][0])<100 && Math.abs(ent.netprops.m_vecOrigin['y'] - removearr[o][1]) < 100 && Math.abs(ent.netprops.m_vecOrigin['z'] - removearr[o][2]) < 100) {
						server.print("               : ("+ent.netprops.m_vecOrigin['x']+", "+ent.netprops.m_vecOrigin['y']+", "+ent.netprops.m_vecOrigin['z']+")");
						// This puts all the trees to keep removed in one spot, so morty has easy access to all of them
						// Note that the collision and display model remain in the previous location.
						//ent.teleport(0,0,0);
						//we can't just remove the trees, because they don't have edict entries; removing them server-side
						//makes the server crash if a client then tries to cut down the tree
						treesToTrim[counter++] = ent;
						break;
					}
				}
			});
		}
		for(var o in MC.TeleportN) {
			var ent = game.findEntityByTargetname(o);
			var data = MC.TeleportN[o];
			debugprint("Atlas Terraform: Repositioning "+o+" to ("+data.x+", "+data.y+", "+data.z+")"); 
			ent.teleport(data.x,data.y,data.z);
		}
		for(var o in MC.TeleportC) {
			var data = MC.TeleportC[o];
			debugprint("Atlas Terraform: Repositioning "+o+" to ("+data.x+", "+data.y+", "+data.z+")"); 
			game.findEntitiesByClassname(o).forEach(function(ent) {
				ent.teleport(data.x, data.y, data.z);
			});
		}
		for(var o in MC.CreateEntity) {
			var e = MC.CreateEntity[o];
			debugprint("Atlas Terraform: Creating Entity "+e.Class+" at ("+e.x+", "+e.y+", "+e.z+")");
			var ent = game.createEntity(e.Class);
			if(e.x)
				ent.teleport(e.x,e.y,e.z);
			for(var g in e.netprops) {
				ent.netprops[g]=e.netprops[g];
			}
		}
		for(var o in MC.CreateUnit) {
			var e = MC.CreateUnit[o];
			debugprint("Atlas Terraform: Creating Unit "+e.Name+" at ("+e.x+", "+e.y+", "+e.z+")");
			var ent = dota.createUnit(e.Name,e.Team);
			if(e.x)
				ent.teleport(e.x,e.y,e.z);
			if(e.model) {
				debugprint("               : Setting model to "+e.model+" ("+modelCache[e.model]+")");
				ent.netprops.m_nModelIndex=modelCache[e.model];
			}
			for(var g in e.netprops) {
				ent.netprops[g]=e.netprops[g];
			}
		}
		var jungletypes = ["small","medium","large","ancient"];
		for(var o in MC.CreepCamps) {
			var e = MC.CreepCamps[o];
			debugprint("Atlas Terraform: Placing "+jungletypes[e.Type]+" jungle camp at ("+e.x+", "+e.y+", "+e.z+")");
			var spawn= game.createEntity("npc_dota_neutral_spawner");
			//What values to set determined by dota map values
			spawn.netprops.m_iForcedSpawnType=-1;
			spawn.netprops.m_Type=e.Type;
			spawn.netprops.m_szVolumeName=e.Name+"_volume";
			//spawn.keyvalues.VolumeName=e.Name+"_volume";
			spawn.teleport(e.x,e.y,e.z);
			//What values to set determined by dota map values
			var area = createBrushEntity("trigger_multiple",e.Name+"_volume",e.x,e.y,e.z,e.xmin,e.ymin,e.zmin,e.xmax,e.ymax,e.zmax);
			area.netprops.m_usSolidFlags = 12;
			area.netprops.m_spawnFlags   = 64;
			//And since that brush creation there didn't work...
			timers.setInterval(function() {
				spawnJungle(spawn,e.Type,300);
			},30000);
		}
		if(MC.Roshan) {
			var e = MC.Roshan;
			debugprint("Atlas Terraform: Placing Roshan at ("+e.x+", "+e.y+", "+e.z+")");
			var spawn = game.createEntity("npc_dota_roshan_spawner");
			spawn.teleport(e.x,e.y,e.z);
			var p = 0;
			for(var k in MC.Roshan.AttackableAreas) {
				var o = MC.Roshan.AttackableAreas[k];
				var area = createBrushEntity("trigger_boss_attackable","roshan_attackable_area_"+(p++),
						o.x,o.y,o.z,
						o.xmin,o.ymin,o.zmin,
						o.xmax,o.ymax,o.zmax);
			}
			area.netprops.StartDisabled = 0;
			spawnRoshan(spawn);
		}
		for(var o in MC.Lanes) {
			if(o!="mid" && o!="top" && o!="bot") {
				debugprint("Atlas Terraform: Invalid lane! Was "+o);
				continue;
			}
			debugprint("Atlas Terraform: Placing lane \""+o+"\"");
			var goodwps = Array();
			var goodspawner;
			var badwps = Array();
			var badspawner;
			var en = MC.Lanes[o];
			{
				index = 1;
				for(var wp in MC.Lanes[o].goodwaypoints) {
					debugprint("          good : ["+en.goodwaypoints[index-1][0]+", "+en.goodwaypoints[index-1][1]+", "+en.goodwaypoints[index-1][2]+"]");
					goodwps[index] = game.createEntity("path_corner");
					goodwps[index].teleport(en.goodwaypoints[index-1][0],en.goodwaypoints[index-1][1],en.goodwaypoints[index-1][2]);
					goodwps[index].netprops.m_iName="lane_"+o+"_pathcorner_goodguys_"+index;
					index = index+1;
				}
				maxindex = index-1;
				index=1;
				for(var wp in MC.Lanes[o].goodwaypoints) {
					if(index != maxindex);
						goodwps[index].keyvalues["Next stop target"]="lane_"+o+"_pathcorner_goodguys_"+(index+1);
					index = index+1;
				}
				goodspawner = game.createEntity("npc_dota_spawner_good_"+o);
				goodspawner.netprops.m_szNPCFirstWaypoint = "lane_"+o+"_pathcorner_goodguys_1";
				goodspawner.netprops.m_iInitialTeamNum = 2;
				goodspawner.netprops.m_iTeamNum = 2;
				goodspawner.netprops.m_iName="lane_"+o+"_goodguys_melee_spawner";
				goodspawner.teleport(en.goodwaypoints[0][0],en.goodwaypoints[0][1],en.goodwaypoints[0][2]);
			}
			{
				index=1;
				for(var wp in en.goodtowers) {
					var tow = dota.createUnit('npc_dota_goodguys_tower'+(index++)+'_'+o,2);
					tow.teleport(en.goodtowers[wp][0],en.goodtowers[wp][1],en.goodtowers[wp][2]);
				}
			}
			{
				index = 1;
				for(var wp in MC.Lanes[o].badwaypoints) {
					debugprint("           bad : ["+en.badwaypoints[index-1][0]+", "+en.badwaypoints[index-1][1]+", "+en.badwaypoints[index-1][2]+"]");
					badwps[index] = game.createEntity("path_corner");
					badwps[index].teleport(en.badwaypoints[index-1][0],en.badwaypoints[index-1][1],en.badwaypoints[index-1][2]);
					badwps[index].netprops.m_iName="lane_"+o+"_pathcorner_badguys_"+index;
					index = index+1;
				}
				maxindex = index-1;
				index=1;
				for(var wp in MC.Lanes[o].badwaypoints) {
					if(index != maxindex);
						badwps[index].keyvalues["Next stop target"]="lane_"+o+"_pathcorner_badguys_"+(index+1);
					index = index+1;
				}
				badspawner = game.createEntity("npc_dota_spawner_bad_"+o);
				badspawner.netprops.m_szNPCFirstWaypoint = "lane_"+o+"_pathcorner_badguys_1";
				badspawner.netprops.m_iInitialTeamNum = 3;
				badspawner.netprops.m_iTeamNum = 3;
				badspawner.netprops.m_iName="lane_"+o+"_badguys_melee_spawner";
				badspawner.teleport(en.badwaypoints[0][0],en.badwaypoints[0][1],en.badwaypoints[0][2]);
			}
			{
				index = 1;
				for(var wp in en.badtowers) {
					var tow = dota.createUnit('npc_dota_badguys_tower'+(index++)+'_'+o,3);
					tow.teleport(en.badtowers[wp][0],en.badtowers[wp][1],en.badtowers[wp][2]);
					//model should be models/props_structures/tower_bad.mdl
				}
			}
		}
		mapInitialized=true;
	}
}
