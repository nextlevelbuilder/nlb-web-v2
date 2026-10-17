/**
 * WebGL 1 shaders for the sky. One opaque background pass (nebula in dark, atlas paper in light),
 * then premultiplied points and hairlines blended ONE / ONE_MINUS_SRC_ALPHA: dark writes alpha 0
 * (additive starlight), light writes alpha (ink over paper).
 */
const PRECISION = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

export const BACKGROUND_VERTEX = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

export const BACKGROUND_FRAGMENT = [
  `${PRECISION}uniform vec2 uRes;uniform float uTime,uLight,uScroll;`,
  'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
  'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
  'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
  'void main(){vec2 uv=gl_FragCoord.xy/uRes.y;vec2 q=uv+vec2(0.,uScroll*.12);float t=uTime*.012;',
  ' float f1=fbm(q*1.35+vec2(t,-t*.6));float f2=fbm(q*2.6+f1*1.8-vec2(t*.7,0.));',
  ' vec2 c=gl_FragCoord.xy/uRes-.5;float r2=dot(c,c);',
  ' vec3 d=vec3(.022,.026,.05);',
  ' d+=vec3(.17,.10,.30)*pow(smoothstep(.42,.95,f2),1.6)*.5;',
  ' d+=vec3(.04,.12,.17)*pow(smoothstep(.5,1.,f1),2.)*.42;',
  ' d*=1.-r2*1.1;',
  ' vec3 l=vec3(.937,.906,.839);',
  ' l-=vec3(.045,.055,.075)*(f1-.45);',
  ' l-=vec3(.05,.075,.11)*smoothstep(.6,.95,fbm(q*4.5+3.))*.4;',
  ' l+=(h(floor(gl_FragCoord.xy))-.5)*.03;',
  ' l*=1.-r2*.22;',
  ' vec3 col=mix(d,l,uLight);col+=(h(gl_FragCoord.xy+fract(uTime))-.5)*.01*(1.-uLight);',
  ' gl_FragColor=vec4(col,1.);}',
].join('\n');

export const POINT_VERTEX = [
  'attribute vec2 aPos;attribute float aSize,aAlpha,aKind;uniform vec2 uRes;uniform float uDpr,uMaxPs;',
  'varying float vA,vK,vPs;',
  'void main(){vec2 p=aPos/uRes*2.-1.;p.y=-p.y;gl_Position=vec4(p,0.,1.);',
  ' float pad=aKind>1.5?12.:(aKind>.5?7.:3.);vPs=min(aSize*pad*uDpr,uMaxPs);gl_PointSize=vPs;vA=aAlpha;vK=aKind;}',
].join('\n');

export const POINT_FRAGMENT = [
  `${PRECISION}uniform float uLight,uDpr;uniform vec3 uStarD,uStarL,uHeroD,uHeroL;varying float vA,vK,vPs;`,
  'void main(){vec2 c=gl_PointCoord*2.-1.;float pad=vK>1.5?12.:(vK>.5?7.:3.);float hf=vPs*.5;vec2 pc=c*hf;float d=length(pc);float R=max(hf/pad,.5);',
  ' float edge=1.-smoothstep(.72,1.,length(c));',
  ' float I=smoothstep(R+uDpr*.6,R*.3,d)+exp(-d*d/(R*R*5.))*.5+exp(-d/(R*2.4))*.22;',
  ' if(vK>.5){float sp=exp(-abs(pc.y)/(.6*uDpr))*exp(-abs(pc.x)/(R*3.4))+exp(-abs(pc.x)/(.6*uDpr))*exp(-abs(pc.y)/(R*3.4));I+=sp*(vK>1.5?.95:.45);}',
  ' I*=edge;',
  ' float aa=uDpr*.75;float L=1.-smoothstep(R*.85-aa,R*.85+aa,d);',
  ' if(vK>.5){L=max(L,(1.-smoothstep(0.,uDpr*.85,abs(d-R*2.2)))*.85);}',
  ' if(vK>1.5){float a=atan(pc.y,pc.x);float rays=pow(abs(cos(a*4.)),70.)*step(R*3.,d)*(1.-smoothstep(R*4.5,R*10.,d));L=max(L,rays*.9);}',
  ' L*=edge;',
  ' vec3 cd=vK>1.5?uHeroD:uStarD;vec3 cl=vK>1.5?uHeroL:uStarL;',
  ' float ad=I*vA;float al=clamp(L*vA,0.,1.);',
  ' gl_FragColor=mix(vec4(cd*ad,0.),vec4(cl*al,al),uLight);}',
].join('\n');

export const LINE_VERTEX = 'attribute vec2 aPos;attribute float aAlpha;uniform vec2 uRes;varying float vA;void main(){vec2 p=aPos/uRes*2.-1.;p.y=-p.y;gl_Position=vec4(p,0.,1.);vA=aAlpha;}';

export const LINE_FRAGMENT = `${PRECISION}uniform float uLight;uniform vec3 uLineD,uLineL;varying float vA;void main(){gl_FragColor=mix(vec4(uLineD*vA,0.),vec4(uLineL*vA,vA),uLight);}`;
