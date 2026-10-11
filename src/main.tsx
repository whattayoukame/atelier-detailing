import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, CalendarBlank, CarProfile, ChatsCircle, House, List, MapPin, Phone, Sparkle, X } from '@phosphor-icons/react';
import { api, isDemo } from './api';
import { StudioContext } from './studio-context';
import { HomePage, ServicesPage, BookingPage, MyBookingPage } from './public-pages';
import { AdminPage, LoginPage } from './owner-pages';
import { Assistant } from './shared';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import './style.css';

const queryClient = new QueryClient({ defaultOptions: {queries:{retry:1,staleTime:15_000}} });
declare const __PAGES_BUILD__: boolean;

class RouteErrorBoundary extends React.Component<{children:React.ReactNode;home:string},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidCatch(error:Error, info:React.ErrorInfo) {
    console.error('Ошибка при открытии страницы',error,info.componentStack);
  }
  render() {
    if (this.state.failed) return <div className="container inner-page route-error" role="alert">
      <span className="eyebrow">ОШИБКА ЗАГРУЗКИ</span>
      <h1>Не удалось открыть страницу.</h1>
      <p>Попробуйте обновить страницу или вернуться на главную.</p>
      <div className="route-error-actions"><button type="button" className="btn btn-primary" onClick={()=>window.location.reload()}>Обновить страницу <ArrowRight size={18}/></button><Link to={this.props.home} className="btn btn-outline">На главную</Link></div>
    </div>;
    return this.props.children;
  }
}

function Glass() {
  const location=useLocation();
  useEffect(()=>{
    // The GPU lens can cover interactive content in iOS Safari / standalone PWAs.
    // On small screens the CSS glass surface stays visible without an extra canvas.
    if(window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 760px)').matches) return;
    let active=true, effects:{destroy:()=>void}[]=[];
    import('liquid-gl').then(({default:liquidGL})=>{
      if(!active) return;
      try {
        if(document.querySelector('.hero-liquid') && document.querySelector('.hero-visual')) effects.push(liquidGL({target:'.hero-liquid',snapshot:'.hero-visual',content:'.hero-glass-content',engine:'auto',refraction:0.012,bevelWidth:0.16,frost:2,tint:'rgba(11,18,29,.24)',shadow:true,specular:true,reveal:'none'}));
      }catch(error){ console.warn('Glass fallback',error); }
    }).catch(()=>undefined);
    return ()=>{active=false;effects.forEach(e=>{try{e.destroy();}catch{ /* CSS fallback */ }});};
  },[location.pathname]);
  return null;
}
function Reveals() {
  const location=useLocation();
  useEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const o=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');o.unobserve(e.target);}}),{threshold:.07});
    const timer=window.setTimeout(()=>document.querySelectorAll('.reveal').forEach(x=>o.observe(x)),50);
    return ()=>{clearTimeout(timer);o.disconnect();};
  },[location.pathname]);return null;
}
function AppShell(){
  const {slug}=useParams(); const {pathname}=useLocation(); const [chat,setChat]=useState(false);
  const q=useQuery({queryKey:['studio',slug],queryFn:()=>api.studio(slug!)});
  useEffect(()=>{if(q.data){
    document.title=q.data.name+' — онлайн-запись';
    // The tenant PWA manifest has root-based URLs and is for the local/standalone build.
    if(!__PAGES_BUILD__){
      const manifest=document.querySelector('link[rel=manifest]')||document.createElement('link');
      manifest.setAttribute('rel','manifest');
      manifest.setAttribute('href',`/tenants/${slug}/manifest.webmanifest`);
      document.head.appendChild(manifest);
    }
  }},[q.data,slug]);
  if(q.isLoading) return <div className="splash"><div className="mark">A<span>.</span></div><p>ЗАГРУЖАЕМ СТУДИЮ</p></div>;
  if(q.isError||!q.data) return <div className="splash"><h1>Студия не найдена</h1><Link className="btn" to="/s/atelier/">Вернуться к образцу</Link></div>;
  const s=q.data, base=`/s/${slug}`, admin=pathname.includes('/admin');
  return <StudioContext.Provider value={s}>
    <div className={`app ${admin?'admin-mode':''}`}>
      <div className="top-bar"><span>ОТКРЫТА ОНЛАЙН-ЗАПИСЬ</span><span className="top-bar-right"><span className="status-dot"/> {isDemo?'ДЕМО-РЕЖИМ':s.published?'ПРИНИМАЕМ ЗАПИСИ':'ПРЕДПРОСМОТР'}</span></div>
      <header className="site-header"><Link to={base+'/'} className="brand"><span className="brand-symbol">A<span>·</span></span><span>{s.name}<small>AUTO CARE STUDIO</small></span></Link>
        <nav className="desktop-nav"><Link className={pathname===base+'/'?'selected':''} to={base+'/'}>Главная</Link><Link className={pathname.includes('/services')?'selected':''} to={base+'/services'}>Услуги</Link><Link className={pathname.includes('/my')?'selected':''} to={base+'/my'}>Моя запись</Link></nav>
        <div className="header-actions"><a className="header-phone" href={`tel:${s.phone.replace(/[^+\d]/g,'')}`}><Phone size={17}/><span>{s.phone}</span></a><Link className="header-book" to={base+'/booking'}>Записаться <ArrowUpRight size={18}/></Link></div>
      </header>
      {isDemo&&<div className="demo-banner"><span>Это интерактивный образец. Записи здесь хранятся только в вашем браузере.</span><Link to={base+'/admin'}>Открыть кабинет <ArrowRight size={14}/></Link></div>}
      <main><RouteErrorBoundary key={pathname} home={base+'/'}><Routes><Route index element={<HomePage/>}/><Route path="services" element={<ServicesPage/>}/><Route path="booking" element={<BookingPage/>}/><Route path="my" element={<MyBookingPage/>}/><Route path="admin/login" element={<LoginPage/>}/><Route path="admin/*" element={<AdminPage/>}/><Route path="*" element={<Navigate to="." replace/>}/></Routes></RouteErrorBoundary></main>
      {!admin&&<><footer className="footer"><div><span className="brand-symbol">A<span>·</span></span><p>{s.name}<small>ДЕТАЛИ СОЗДАЮТ СОВЕРШЕНСТВО</small></p></div><p>{s.address}</p><Link to={base+'/admin/login'}>Для владельца <ArrowUpRight size={14}/></Link><div className="copyright">© {new Date().getFullYear()} {s.name} · Сделано с вниманием к деталям</div></footer>
        <nav className="mobile-bottom" aria-label="Основная навигация"><div className="bottom-links"><Link className={pathname===base+'/'?'current':''} to={base+'/'}><House size={22}/><span>Главная</span></Link><Link className={pathname.includes('/services')||pathname.includes('/booking')?'current':''} to={base+'/services'}><List size={22}/><span>Услуги</span></Link><Link className={pathname.includes('/my')?'current':''} to={base+'/my'}><CalendarBlank size={22}/><span>Моя запись</span></Link></div></nav>
        <button type="button" onClick={()=>setChat(true)} className="chat-fab" aria-label="Написать помощнику"><ChatsCircle size={25} weight="fill"/></button></>}
      {chat&&<Assistant owner={false} onClose={()=>setChat(false)}/>}
      <Glass/><Reveals/>
    </div>
  </StudioContext.Provider>;
}

function Start(){return <Navigate to="/s/atelier/" replace/>;}
const Router=__PAGES_BUILD__?HashRouter:BrowserRouter;
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><Router><Routes><Route path="/" element={<Start/>}/><Route path="/s/:slug/*" element={<AppShell/>}/><Route path="*" element={<Start/>}/></Routes></Router></QueryClientProvider></React.StrictMode>);
