/** Hit areas share the exact visible command geometry; the portrait and blank padding are not buttons. */
export const commandPosition=(index:number)=>({x:176+Math.floor(index/4)*148,y:211+(index%4)*13});
export function commandAt(x:number,y:number,count:number):number|undefined {
  if(x<168||x>=464||y<209||y>=261)return undefined;
  const index=Math.floor((x-168)/148)*4+Math.floor((y-209)/13);
  return index<count?index:undefined;
}
