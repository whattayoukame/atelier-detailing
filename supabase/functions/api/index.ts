// Supabase Edge Function. All private data access stays here; the browser receives only the anon key.
import { createClient } from 'npm:@supabase/supabase-js@2';
import OpenAI from 'npm:openai@5';
import { fromZonedTime, formatInTimeZone } from 'npm:date-fns-tz@3.2.0';
import { z } from 'npm:zod@4';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
function err(message: string, status = 400) { return json({ error: message }, status); }
function ok<T>(data: T | null, error: { message: string } | null): T { if (error) throw Error(error.message); if (data == null) throw Error('Данные не найдены'); return data; }
const uuid = z.string().uuid();
const safeText = z.string().trim().min(2).max(100);
const bookInput = z.object({ slug: z.string(), serviceId: uuid, startsAt: z.string().datetime(), customerName: safeText,
  phone: z.string().regex(/^\+?[\d\s()\-]{7,22}$/), car: safeText, idempotencyKey: uuid });
const statusSchema = z.enum(['reserved','arrived','ready','completed','cancelled']);
const gallerySchema = z.object({ image: z.string().min(1).max(1000), caption: z.string().min(1).max(160) });
const serviceSchema = z.object({ id: uuid, title: z.string().min(2).max(100), category: z.string().max(80), description: z.string().max(350),
  price: z.number().nonnegative(), durationMinutes: z.number().int().min(30).max(10080), bufferMinutes: z.number().int().min(0).max(240), enabled: z.boolean() });
const baySchema = z.object({ id: uuid, title: z.string().min(1).max(80), enabled: z.boolean() });
const hoursSchema = z.object({ open: z.string().regex(/^\d\d:\d\d$/), close: z.string().regex(/^\d\d:\d\d$/) }).nullable();
const studioPatchSchema = z.object({
  name: z.string().min(2).max(90).optional(), eyebrow: z.string().max(100).optional(), tagline: z.string().max(140).optional(),
  description: z.string().max(1000).optional(), address: z.string().min(5).max(200).optional(), phone: z.string().min(5).max(40).optional(),
  hero: z.string().min(1).max(1000).optional(), logo: z.string().min(1).max(1000).optional(),
  cancellationHours: z.number().int().min(0).max(720).optional(),
  infoCards: z.array(z.object({ icon: z.string(), title: z.string(), text: z.string() })).length(3).optional(),
  schedule: z.record(z.string(), hoursSchema).optional(), daysOff: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  services: z.array(serviceSchema).min(1).optional(), bays: z.array(baySchema).min(1).optional()
}).strict();

async function one(table: string, field: string, val: string): Promise<[any,any]> {
  const { data, error } = await service.from(table).select('*').eq(field,val).maybeSingle(); return [data,error];
}
async function studio(slug: string) { const [row,error] = await one('studios','slug',slug); return ok(row,error); }
async function assembled(s: any) {
  const [sv,by,ga] = await Promise.all([
    service.from('services').select('*').eq('studio_id',s.id).order('price'),
    service.from('bays').select('*').eq('studio_id',s.id).order('title'),
    service.from('gallery').select('*').eq('studio_id',s.id).order('sort_order')
  ]);
  if (sv.error || by.error || ga.error) throw Error(sv.error?.message || by.error?.message || ga.error?.message);
  return {
    slug:s.slug,published:s.published,name:s.name,eyebrow:s.eyebrow,tagline:s.tagline,description:s.description,address:s.address,phone:s.phone,
    timezone:s.timezone,currency:s.currency,hero:s.hero,logo:s.logo,cancellationHours:s.cancellation_hours,infoCards:s.info_cards,
    schedule:s.schedule,daysOff:s.days_off,
    services:(sv.data||[]).map((x:any)=>({id:x.id,title:x.title,category:x.category,description:x.description,price:Number(x.price),durationMinutes:x.duration_minutes,bufferMinutes:x.buffer_minutes,enabled:x.enabled})),
    bays:(by.data||[]).map((x:any)=>({id:x.id,title:x.title,enabled:x.enabled})),
    gallery:(ga.data||[]).map((x:any)=>({id:x.id,image:x.image,caption:x.caption}))
  };
}
function mapBooking(b:any) { return { id:b.id,serviceId:b.service_id,serviceTitle:b.services?.title||'',bayId:b.bay_id,
  customerName:b.customer_name,phone:b.phone,car:b.car,startsAt:b.starts_at,endsAt:b.ends_at,status:b.status,createdAt:b.created_at,cancellationToken:b.cancellation_token }; }
async function ownerFor(req: Request, s:any) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if (!token) throw Error('Войдите в кабинет владельца');
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw Error('Требуется вход владельца');
  const { data:membership, error:membershipError } = await service.from('owner_memberships').select('user_id').eq('user_id',data.user.id).eq('studio_id',s.id).maybeSingle();
  if (membershipError || !membership) throw Error('Нет доступа к этой студии');
  return data.user.id;
}
async function availability(s:any, serviceId:string, date:string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(`${date}T12:00:00Z`))) throw Error('Неверная дата');
  const sv = ok(...await one('services','id',serviceId));
  if (sv.studio_id!==s.id || !sv.enabled) throw Error('Услуга недоступна');
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const hours = s.schedule[String(day)];
  if (!hours || s.days_off.includes(date)) return {date,available:[],unavailable:[]};
  const {data:bays,error:bayErr} = await service.from('bays').select('id').eq('studio_id',s.id).eq('enabled',true);
  if (bayErr) throw Error(bayErr.message);
  const dayStart = fromZonedTime(`${date}T00:00:00`,s.timezone);
  const dayEnd = new Date(dayStart.getTime()+86400000+sv.duration_minutes*60000+sv.buffer_minutes*60000);
  const {data:bookings,error:bErr} = await service.from('bookings').select('bay_id,starts_at,ends_at,status').eq('studio_id',s.id).neq('status','cancelled').lt('starts_at',dayEnd.toISOString()).gt('ends_at',dayStart.toISOString());
  if (bErr) throw Error(bErr.message);
  const open = Number(hours.open.slice(0,2))*60+Number(hours.open.slice(3));
  const close = Number(hours.close.slice(0,2))*60+Number(hours.close.slice(3));
  const available:string[] = [], unavailable:string[] = [];
  for (let min=Math.ceil(open/30)*30;min<close;min+=30) {
    if (sv.duration_minutes<1440 && min+sv.duration_minutes>close) break;
    const iso = fromZonedTime(`${date}T${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}:00`,s.timezone).toISOString();
    const start = Date.parse(iso), end=start+(sv.duration_minutes+sv.buffer_minutes)*60000;
    if (start<Date.now()+30*60000 || start>Date.now()+90*86400000) continue;
    const free = bays?.some(bay=>!(bookings||[]).some(b=>b.bay_id===bay.id&&Date.parse(b.starts_at)<end&&Date.parse(b.ends_at)>start));
    (free?available:unavailable).push(iso);
  }
  return { date,available,unavailable };
}
async function bookingsFor(s:any) { const {data,error} = await service.from('bookings').select('*,services(title)').eq('studio_id',s.id).order('starts_at',{ascending:false}).limit(1000); if(error) throw Error(error.message); return (data||[]).map(mapBooking); }
async function paymentsFor(s:any) { const {data,error} = await service.from('payments').select('*').eq('studio_id',s.id).order('created_at',{ascending:false}).limit(1000); if(error) throw Error(error.message); return (data||[]).map((p:any)=>({id:p.id,bookingId:p.booking_id,amount:Number(p.amount),type:p.type,createdAt:p.created_at})); }

async function assistant(req:Request,s:any,body:any) {
  const {message,owner} = z.object({message:z.string().trim().min(1).max(500),owner:z.boolean().default(false)}).parse(body);
  let bookings:any[] = [], payments:any[] = [];
  let uid='visitor';
  if(owner) { uid=await ownerFor(req,s); [bookings,payments] = await Promise.all([bookingsFor(s),paymentsFor(s)]); }
  else { uid=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'; }
  const idBuffer = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${s.id}:${uid}`));
  const hashed = Array.from(new Uint8Array(idBuffer)).map(x=>x.toString(16).padStart(2,'0')).join('');
  const {data:requestRow,error:rateError}=await service.rpc('begin_ai_request',{p_studio:s.id,p_identity:hashed,p_limit:Number(Deno.env.get('AI_DAILY_TOKEN_LIMIT')||30000)});
  const requestId = ok(requestRow,rateError);
  const data = await assembled(s);
  const match = data.services.find((x:any)=>message.toLowerCase().includes(x.title.toLowerCase()) || x.title.toLowerCase().split(' ').some((w:string)=>w.length>5&&message.toLowerCase().includes(w.slice(0,5))));
  const needsTime = /окно|врем|завтр|ближай|свобод|запис/i.test(message);
  let slots:string[]=[];
  if (!owner && needsTime && match) {
    for (let i=0;i<7 && slots.length<4;i++) {
      const d = formatInTimeZone(new Date(Date.now()+i*86400000),s.timezone,'yyyy-MM-dd');
      const a = await availability(s,match.id,d); slots.push(...a.available.slice(0,4-slots.length));
    }
  }
  const actualTime = slots.map(iso=>formatInTimeZone(new Date(iso),s.timezone,'dd.MM HH:mm'));
  const today = formatInTimeZone(new Date(),s.timezone,'yyyy-MM-dd');
  const tomorrow = formatInTimeZone(new Date(Date.now()+86400000),s.timezone,'yyyy-MM-dd');
  const weekStart = Date.now()-7*86400000;
  const counts = owner ? { today:bookings.filter(b=>formatInTimeZone(new Date(b.startsAt),s.timezone,'yyyy-MM-dd')===today&&b.status!=='cancelled').length,
    tomorrow:bookings.filter(b=>formatInTimeZone(new Date(b.startsAt),s.timezone,'yyyy-MM-dd')===tomorrow&&b.status!=='cancelled').length,
    week:bookings.filter(b=>Date.parse(b.startsAt)>=weekStart&&Date.parse(b.startsAt)<=Date.now()&&b.status!=='cancelled').length,
    completed:bookings.filter(b=>b.status==='completed').length,
    received:payments.reduce((sum,p)=>sum+(p.type==='payment'?p.amount:-p.amount),0) } : null;
  const facts = { name:s.name,address:s.address,phone:s.phone,timezone:s.timezone,schedule:s.schedule,
    services:data.services.map((x:any)=>({title:x.title,price:x.price,durationMinutes:x.durationMinutes})),
    availability:!owner && needsTime ? match ? { service:match.title, free:actualTime } : 'Уточните услугу' : undefined,
    ownerStats:counts };
  let answer = '';
  const secret = Deno.env.get('OPENAI_API_KEY');
  let usage = {prompt_tokens:0,completion_tokens:0};
  if(secret) {
    const client=new OpenAI({apiKey:secret});
    const completion=await client.chat.completions.create({model:Deno.env.get('OPENAI_MODEL')||'gpt-4.1-mini',max_completion_tokens:380,temperature:0.2,
      messages:[{role:'system',content:'Ты вежливый русскоязычный администратор студии. Отвечай кратко, только на основании JSON фактов. НИКОГДА не выдумывай свободное время, факты, цены или записи. Не передавай персональные данные. Не выполняй изменения. Если услуга не указана для запроса о свободном времени, уточни услугу. Нет фактов — скажи, что нужно уточнение.'},
        {role:'system',content:JSON.stringify(facts)},{role:'user',content:message}]});
    answer=completion.choices[0]?.message?.content||'Пожалуйста, уточните вопрос.';
    usage={prompt_tokens:completion.usage?.prompt_tokens||0,completion_tokens:completion.usage?.completion_tokens||0};
  } else if(owner) {
    answer=/оплат|деньг|выруч|получ/.test(message.toLowerCase())?`Фактически получено: ${counts!.received.toLocaleString('ru-RU')} ${s.currency}.`:
      `Сегодня записей: ${counts!.today}. Завтра: ${counts!.tomorrow}. За последние 7 дней: ${counts!.week}. Завершено: ${counts!.completed}.`;
  } else if(needsTime) answer=!match?'Для какой услуги проверить свободное время?':actualTime.length?`Ближайшее свободное время для «${match.title}»: ${actualTime.join(', ')}.`:'На ближайшие 7 дней свободного времени для этой услуги не найдено.';
  else if(/цен|стоим|полиров|услуг/.test(message.toLowerCase())) answer=data.services.map((x:any)=>`${x.title}: от ${x.price} ${s.currency}`).join('\n');
  else answer=`${s.name}. Адрес: ${s.address}. Телефон: ${s.phone}. Напишите, какая услуга вас интересует.`;
  await service.from('assistant_requests').update({input_tokens:usage.prompt_tokens,output_tokens:usage.completion_tokens}).eq('id',requestId);
  return {answer};
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  try {
    const u=new URL(req.url), path=u.pathname.split('/functions/v1/api/')[1]||'';
    const body = ['POST','PATCH'].includes(req.method)?await req.json():{};
    const slug = req.method==='GET'?u.searchParams.get('slug'):body.slug;
    if(!slug || !/^[a-z0-9][a-z0-9-]{1,38}$/.test(slug)) return err('Неверный адрес студии');
    const s=await studio(slug);
    if(path==='studio'&&req.method==='GET') return json(await assembled(s));
    if(path==='availability'&&req.method==='GET') return json(await availability(s,u.searchParams.get('serviceId')||'',u.searchParams.get('date')||''));
    if(path==='reserve'&&req.method==='POST') {
      const input=bookInput.parse(body);
      const {data,error}=await service.rpc('reserve_booking',{p_studio:s.id,p_service:input.serviceId,p_start:input.startsAt,p_name:input.customerName,p_phone:input.phone,p_car:input.car,p_key:input.idempotencyKey});
      const result=ok(data,error); const {data:sv}=await service.from('services').select('title').eq('id',result.service_id).single();
      return json(mapBooking({...result,services:sv}));
    }
    if(path==='booking'&&req.method==='GET'||path==='cancel'&&req.method==='POST') {
      const id=uuid.parse(req.method==='GET'?u.searchParams.get('id'):body.id);
      const token=uuid.parse(req.method==='GET'?u.searchParams.get('token'):body.token);
      const {data,error}=await service.from('bookings').select('*,services(title)').eq('id',id).eq('studio_id',s.id).eq('cancellation_token',token).maybeSingle();
      const b=ok(data,error);
      if(path==='cancel') {
        if(Date.parse(b.starts_at)-Date.now()<s.cancellation_hours*3600000) return err('Срок самостоятельной отмены истёк');
        if(b.status!=='reserved') return err('Отменить можно только неподтверждённую запись');
        const {data:updated,error:e}=await service.from('bookings').update({status:'cancelled'}).eq('id',b.id).eq('status','reserved').select('*,services(title)').single();
        return json(mapBooking(ok(updated,e)));
      }
      return json(mapBooking(b));
    }
    if(path==='assistant'&&req.method==='POST') return json(await assistant(req,s,body));
    if(path.startsWith('owner/')) await ownerFor(req,s);
    if(path==='owner/overview'&&req.method==='GET') { const [bookings,payments]=await Promise.all([bookingsFor(s),paymentsFor(s)]); return json({bookings,payments}); }
    if(path==='owner/studio'&&req.method==='PATCH') {
      const patch=studioPatchSchema.parse(body.patch);
      const names:Record<string,string>={name:'name',eyebrow:'eyebrow',tagline:'tagline',description:'description',address:'address',phone:'phone',hero:'hero',logo:'logo',cancellationHours:'cancellation_hours',infoCards:'info_cards',schedule:'schedule',daysOff:'days_off'};
      const record:Record<string,unknown>={}; for(const [key,value] of Object.entries(patch)) if(names[key]) record[names[key]]=value;
      if(Object.keys(record).length) { const {error}=await service.from('studios').update(record).eq('id',s.id); if(error) throw Error(error.message); }
      if(patch.services) { const {error}=await service.from('services').upsert(patch.services.map(x=>({id:x.id,studio_id:s.id,title:x.title,category:x.category,description:x.description,price:x.price,duration_minutes:x.durationMinutes,buffer_minutes:x.bufferMinutes,enabled:x.enabled})),{onConflict:'id'}); if(error) throw Error(error.message); }
      if(patch.bays) { const {error}=await service.from('bays').upsert(patch.bays.map(x=>({id:x.id,studio_id:s.id,title:x.title,enabled:x.enabled})),{onConflict:'id'}); if(error) throw Error(error.message); }
      const updated=await studio(slug); return json(await assembled(updated));
    }
    if(path==='owner/booking'&&req.method==='PATCH') {
      const id=uuid.parse(body.id);
      const {data:b,error:e}=await service.from('bookings').select('*').eq('studio_id',s.id).eq('id',id).maybeSingle(); ok(b,e);
      if(body.patch?.startsAt) {
        const date=z.string().datetime().parse(body.patch.startsAt);
        const {data,error}=await service.rpc('reschedule_booking',{p_studio:s.id,p_booking:id,p_start:date}); ok(data,error);
      }
      if(body.patch?.status) {
        const status=statusSchema.parse(body.patch.status);
        const {error}=await service.from('bookings').update({status}).eq('id',id).eq('studio_id',s.id); if(error) throw Error(error.message);
      }
      const {data:updated,error:e2}=await service.from('bookings').select('*,services(title)').eq('id',id).eq('studio_id',s.id).single(); return json(mapBooking(ok(updated,e2)));
    }
    if(path==='owner/payment'&&req.method==='POST') {
      const x=z.object({bookingId:uuid,amount:z.number().positive().max(100000000),type:z.enum(['payment','refund'])}).parse(body);
      const {data:b}=await service.from('bookings').select('id').eq('id',x.bookingId).eq('studio_id',s.id).maybeSingle(); if(!b) return err('Запись не принадлежит этой студии');
      if(x.type==='refund') { const {data:history,error:e}=await service.from('payments').select('amount,type').eq('booking_id',x.bookingId).eq('studio_id',s.id); if(e) throw Error(e.message); const balance=(history||[]).reduce((a,p)=>a+(p.type==='payment'?Number(p.amount):-Number(p.amount)),0); if(x.amount>balance) return err('Возврат превышает сумму оплат'); }
      const {data,error}=await service.from('payments').insert({studio_id:s.id,booking_id:x.bookingId,amount:x.amount,type:x.type}).select().single(); return json(ok(data,error));
    }
    if(path==='owner/gallery'&&req.method==='POST') {
      const x=gallerySchema.parse(body); const {data,error}=await service.from('gallery').insert({studio_id:s.id,...x,sort_order:Date.now()}).select().single(); return json(ok(data,error));
    }
    if(path==='owner/gallery'&&req.method==='PATCH') {
      const id=uuid.parse(body.id); const patch=gallerySchema.partial().parse(body.patch);
      const {data,error}=await service.from('gallery').update(patch).eq('id',id).eq('studio_id',s.id).select().single(); return json(ok(data,error));
    }
    if(path==='owner/upload'&&req.method==='POST') {
      const mime=z.enum(['image/jpeg','image/png','image/webp']).parse(body.mime);
      const extension=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
      const filePath=`${slug}/${crypto.randomUUID()}.${extension}`;
      const {data,error}=await service.storage.from('studio-media').createSignedUploadUrl(filePath);
      return json(ok(data,error));
    }
    return err('Метод не найден',404);
  } catch(ex) { const message=ex instanceof Error?ex.message:'Неизвестная ошибка';
    const status=/доступ|вход владельца|Требуется вход/.test(message)?403:/лимит|много запросов/.test(message)?429:400;
    console.error('api error',message); return err(message,status);
  }
});
