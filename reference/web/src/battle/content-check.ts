import {createBattle,type BattleDefinition} from './engine.ts';
import {getSkill,skillIds,battleRules} from './skills.ts';
import type {BattleSkill} from './model.ts';
export function validateBattles(definitions:Record<string,BattleDefinition>):string[] {
  const errors=validateSkillDefinitions(skillIds.map(id=>getSkill(id)!));
  const ids=new Set<string>();
  for(const [key,definition] of Object.entries(definitions)) {
    if(ids.has(definition.id))errors.push(`Duplicate battle ${definition.id}`);ids.add(definition.id);
    for(const actor of definition.actors)for(const skill of actor.skillIds??['basic_strike'])if(!getSkill(skill))errors.push(`${key}: missing skill ${skill}`);
    try{createBattle(definition);}catch(error){errors.push(`${key}: ${error instanceof Error?error.message:'Invalid battle'}`);}
  }
  return errors;
}

export function validateSkillDefinitions(definitions:readonly BattleSkill[]):string[] {
  const errors:string[]=[];const ids=new Set<string>();
  for(const skill of definitions){
    if(!skill.id||ids.has(skill.id))errors.push(`Duplicate or empty skill ${skill.id}`);ids.add(skill.id);
    for(const field of ['cost','power','range'] as const)if(!Number.isSafeInteger(skill[field])||skill[field]<0)errors.push(`${skill.id}: invalid ${field}`);
    if(!['light','normal','heavy'].includes(skill.weight)||!['damage','heal','shield'].includes(skill.effect))errors.push(`${skill.id}: invalid behavior`);
    if(skill.lampMarks!==undefined&&(!Number.isInteger(skill.lampMarks)||skill.lampMarks<0||skill.lampMarks>3))errors.push(`${skill.id}: invalid marks`);
    if(skill.consumeMarks!==undefined&&typeof skill.consumeMarks!=='boolean')errors.push(`${skill.id}: invalid detonation`);
    if(skill.knockback!==undefined&&(!Number.isSafeInteger(skill.knockback)||skill.knockback<0||!Number.isSafeInteger(skill.knockback*battleRules.collisionDamagePerCell)))errors.push(`${skill.id}: invalid knockback`);
  }
  return errors;
}
