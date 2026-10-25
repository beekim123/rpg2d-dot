import {test,expect} from '@playwright/test';
type AudioSnapshot={unlocked:boolean;muted:boolean;suspended:boolean;music:string;music_playing:number;effects_playing:number;effect_players:number};
test('native Web audio produces samples and respects mute and visibility notifications',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{
    const original=AudioNode.prototype.connect;
    const meters:AnalyserNode[]=[];
    (window as unknown as {astraAudioMeters:AnalyserNode[]}).astraAudioMeters=meters;
    AudioNode.prototype.connect=function(this:AudioNode,...args:unknown[]){
      const result=Reflect.apply(original,this,args);
      if(args[0] instanceof AudioDestinationNode){
        const meter=this.context.createAnalyser();meter.fftSize=2048;
        Reflect.apply(original,this,[meter]);meters.push(meter);
      }
      return result;
    } as typeof original;
  });
  const state=async()=>JSON.parse(await page.locator('#canvas').getAttribute('data-audio_state')??'{}') as AudioSnapshot;
  const peak=()=>page.evaluate(()=>{
    const meters=(window as unknown as {astraAudioMeters:AnalyserNode[]}).astraAudioMeters;
    let peak=0;for(const meter of meters){const data=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(data);for(const sample of data)peak=Math.max(peak,Math.abs(sample));}return peak;
  });
  await page.goto('/?battle=prologue_ella');
  await expect(page.locator('#canvas')).toHaveAttribute('data-battle_active','true',{timeout:30000});
  expect((await state()).unlocked).toBe(false);expect((await state()).music_playing).toBe(0);
  await page.locator('#canvas').click({position:{x:4,y:530}});
  await expect.poll(async()=>(await state()).unlocked).toBe(true);
  await expect.poll(peak,{timeout:10000}).toBeGreaterThan(0.0001);
  expect((await state()).music).toBe('battle_theme');expect((await state()).effect_players).toBe(6);
  await page.keyboard.press('m');
  await expect.poll(async()=>(await state()).muted).toBe(true);
  await expect.poll(async()=>(await state()).music_playing).toBe(0);
  await expect.poll(peak).toBeLessThan(0.00001);
  await page.keyboard.press('m');
  await expect.poll(peak).toBeGreaterThan(0.0001);
  // Automated Chromium keeps document visibility fixed even when its window changes.
  // Inject only this browser lifecycle input; the native bridge and measured audio remain real.
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async()=>(await state()).suspended).toBe(true);
  await expect.poll(peak).toBeLessThan(0.00001);
  await page.evaluate(()=>{
    Reflect.deleteProperty(document,'hidden');document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async()=>(await state()).suspended).toBe(false);
  await expect.poll(peak).toBeGreaterThan(0.0001);
  expect(errors).toEqual([]);
});
