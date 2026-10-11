import { useState } from 'react';
import { ChatsCircle, ArrowUp, X, Sparkle, Robot } from '@phosphor-icons/react';
import { api } from './api';
import { useSlug, useStudio } from './studio-context';

type Msg = { role:'me'|'bot'; text:string };
export function Assistant({owner,onClose}:{owner:boolean;onClose:()=>void}){
  const s=useStudio(),slug=useSlug();
  const [messages,setMessages]=useState<Msg[]>([{role:'bot',text:owner?'Привет! Я помогу разобраться в записях и финансах студии.':'Здравствуйте! Я помощник студии '+s.name+'. Подскажу услуги, цены и свободное время.'}]);
  const [draft,setDraft]=useState(''),[pending,setPending]=useState(false);
  const examples=owner?['Что у меня завтра?','Сколько машин было на неделе?','Сколько денег получено?']:['Когда ближайшее окно?','Сколько стоит полировка?','Как найти студию?'];
  async function send(value=draft){const v=value.trim();if(!v||pending)return;setDraft('');setMessages(m=>[...m,{role:'me',text:v}]);setPending(true);
    try {const answer=await api.ask(slug,v,owner);setMessages(m=>[...m,{role:'bot',text:answer}]);}catch(e){setMessages(m=>[...m,{role:'bot',text:e instanceof Error?e.message:'Не удалось получить ответ'}]);}finally{setPending(false);}}
  return <div className="chat-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="chat-panel" role="dialog" aria-modal="true" aria-label="Помощник студии">
      <div className="chat-heading"><div className="chat-avatar"><Sparkle size={22}/></div><div><strong>Помощник {s.name.split(' ')[0]}</strong><small><i className="status-dot"/> Онлайн · отвечает по данным студии</small></div><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={22}/></button></div>
      <div className="chat-messages" aria-live="polite">{messages.map((m,i)=><div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}{pending&&<div className="bubble bot typing">Проверяю данные студии<span>···</span></div>}</div>
      <div className="chat-examples">{examples.map(x=><button key={x} onClick={()=>send(x)} disabled={pending}>{x}</button>)}</div>
      <form className="chat-form" onSubmit={e=>{e.preventDefault();send();}}><input aria-label="Ваш вопрос" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Напишите вопрос..." maxLength={500}/><button aria-label="Отправить" disabled={pending||!draft.trim()}><ArrowUp size={20}/></button></form>
      <p className="chat-disclaimer">Помощник использует только сведения этой студии</p>
    </section>
  </div>;
}
