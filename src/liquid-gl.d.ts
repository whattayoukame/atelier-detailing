declare module 'liquid-gl' {
  type LiquidOptions = {target:string; snapshot?:string; content?:string; engine?:string; refraction?:number; bevelWidth?:number; frost?:number; tint?:string; shadow?:boolean; specular?:boolean; resolution?:number; reveal?:string; zIndex?:number};
  export default function liquidGL(options:LiquidOptions): {destroy:()=>void};
}
