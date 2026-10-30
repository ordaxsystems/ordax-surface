import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Send, Sparkles, Square, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIntelligenceClient } from './client-context';
import { getSurfaceWindowTitle } from '../../../../services/surface/destination-catalog.mjs';
import './aura-content.css';

const AURA_CONVERSATION_DEADLINE_MS = 120_000;
type Props = { initialPrompt?: { text: string } | undefined };
type ResultState =
  | { state: 'idle' }
  | { state: 'pending'; prompt: string; partial: string }
  | { state: 'unavailable' }
  | { state: 'error' }
  | { state: 'timeout' };

/** Aura consumes the OS Intelligence port; all transcript data stays in Surface memory. */
export function AuraContent({ initialPrompt }: Props) {
  const { client, snapshot, conversation } = useIntelligenceClient();
  const turns = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot, conversation.getSnapshot);
  const productName = getSurfaceWindowTitle('intelligence');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<ResultState>({ state: 'idle' });
  const activeRequest = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const consumedInitialPrompt = useRef<Props['initialPrompt']>(undefined);

  useEffect(() => {
    setResult({ state: 'idle' });
    return () => { requestGeneration.current++; activeRequest.current?.abort(); activeRequest.current = null; };
  }, [client]);

  useEffect(() => {
    if (snapshot.state !== 'degraded' && snapshot.state !== 'error') return;
    if (activeRequest.current) {
      requestGeneration.current++;
      activeRequest.current.abort();
      activeRequest.current = null;
      setResult({ state: 'unavailable' });
    }
  }, [snapshot.state]);

  const stop = useCallback(() => {
    requestGeneration.current++;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setResult({ state: 'idle' });
  }, []);

  const startNewConversation = () => {
    stop();
    conversation.clear();
    setPrompt('');
  };

  const run = useCallback(async (raw: string) => {
    const normalized = raw.trim();
    if (!normalized) return;
    if (snapshot.state !== 'ready' || !snapshot.inferenceAvailable) {
      setResult({ state: 'unavailable' });
      return;
    }
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const generation = ++requestGeneration.current;
    const context = conversation.context();
    setResult({ state: 'pending', prompt: normalized, partial: '' });
    let timedOut = false;
    const watchdog = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, AURA_CONVERSATION_DEADLINE_MS);
    try {
      const response = await client.ask(normalized, {
        context,
        signal: controller.signal,
        onDelta: (delta: string) => {
          if (controller.signal.aborted || generation !== requestGeneration.current) return;
          setResult(current => current.state === 'pending'
            ? { ...current, partial: (current.partial + delta).slice(0, 65536) }
            : current);
        },
      });
      if (controller.signal.aborted || generation !== requestGeneration.current) return;
      conversation.record(normalized, response);
      setPrompt('');
      setResult({ state: 'idle' });
    } catch {
      if (generation !== requestGeneration.current || (controller.signal.aborted && !timedOut)) return;
      setResult(timedOut ? { state: 'timeout' }
        : client.getSnapshot().state !== 'ready' ? { state: 'unavailable' } : { state: 'error' });
    } finally {
      clearTimeout(watchdog);
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [client, conversation, snapshot.inferenceAvailable, snapshot.state]);

  useEffect(() => {
    if (initialPrompt === undefined || consumedInitialPrompt.current === initialPrompt) return;
    consumedInitialPrompt.current = initialPrompt;
    setPrompt(initialPrompt.text);
    void run(initialPrompt.text);
  }, [initialPrompt, run]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (result.state !== 'pending') void run(prompt);
  }

  const pending = result.state === 'pending';
  const available = snapshot.state === 'ready' && snapshot.inferenceAvailable;
  const serviceLabel = snapshot.state === 'ready' ? 'Pronta · ' + snapshot.modelId
    : snapshot.state === 'busy' ? 'Motor em uso · aguarde a liberação'
    : snapshot.state === 'error' ? 'Falha no serviço de IA local'
    : 'Motor de IA não disponível nesta sessão';

  return <section className="aura-experience" aria-label="Conversa com Aura">
    <header className="aura-toolbar">
      <div className="desktop-content-heading"><Sparkles aria-hidden="true"/><h2>{productName}</h2></div>
      <Button type="button" variant="outline" size="sm" onClick={startNewConversation} disabled={!turns.length && !pending && !prompt.trim()}>
        <Plus aria-hidden="true"/> Nova conversa
      </Button>
    </header>
    <p className="service-state" role="status" data-intelligence-state={snapshot.state}>{serviceLabel}</p>
    <div className="aura-thread" role="log" aria-label="Mensagens desta conversa" aria-live="polite">
      {turns.length === 0 && !pending && <p className="aura-thread-empty">Faça uma pergunta para começar. As respostas reais aparecerão aqui quando o motor estiver pronto.</p>}
      {turns.map(turn => <div key={turn.id} className="aura-exchange">
        <article className="aura-turn" data-speaker="user"><span className="aura-speaker">Você</span><p>{turn.prompt}</p></article>
        <article className="aura-turn" data-speaker="aura"><span className="aura-speaker">{productName}</span><p>{turn.answer}</p><p className="service-state">{turn.engineId} · {turn.modelId}</p></article>
      </div>)}
      {pending && <div className="aura-exchange" aria-busy="true">
        <article className="aura-turn" data-speaker="user"><span className="aura-speaker">Você</span><p>{result.prompt}</p></article>
        <article className="aura-turn" data-speaker="aura"><span className="aura-speaker">{productName} · processando</span><p>{result.partial || 'Aguardando resposta do motor…'}</p></article>
      </div>}
    </div>
    <form className="aura-search" onSubmit={submit}>
      <Sparkles className="aura-star" aria-hidden="true"/>
      <input aria-label="Pergunta para a Aura" placeholder={available ? 'Pergunte ou continue a conversa…' : 'Aguardando disponibilidade do motor…'} value={prompt} onChange={event => setPrompt(event.target.value)} disabled={pending}/>
      {pending ? <Button type="button" variant="outline" onClick={stop} aria-label="Interromper espera da resposta"><Square aria-hidden="true"/> Parar</Button>
        : <Button type="submit" className="send-button" aria-label="Enviar pergunta" disabled={!available || !prompt.trim()}><Send aria-hidden="true"/></Button>}
    </form>
    {result.state === 'unavailable' && <p className="desktop-unconnected aura-feedback" role="status">O motor não está pronto. Sua pergunta foi preservada; tente novamente quando estiver disponível.</p>}
    {result.state === 'error' && <p className="desktop-unconnected aura-feedback" role="alert">Não foi possível concluir a solicitação. A pergunta foi preservada para nova tentativa.</p>}
    {result.state === 'timeout' && <p className="desktop-unconnected aura-feedback" role="alert">A Aura não respondeu dentro do prazo. A espera foi encerrada; nenhuma resposta foi confirmada.</p>}
    <p className="aura-footnote">Conversa temporária nesta sessão da Surface. Sem sincronização ou memória persistente; somente respostas confirmadas entram no contexto.</p>
  </section>;
}
