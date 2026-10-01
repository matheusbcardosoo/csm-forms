// /app/carteirinhas e /app/carteirinhas/arquivadas (08-carteirinhas §7.2):
// as pastas de eventos, cada uma com contadores e pendências.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRecurso } from '@/hooks/useRecurso';
import { Aviso, Botao, BotaoLink, Cabecalho, Carregando, EstadoVazio, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import type { PastaResumo } from '@shared/types/carteirinha';
import { fmtValidade, ModalPasta, TagsPendencias, urlLogoPasta } from './comum';

export function Pastas({ arquivadas = false }: { arquivadas?: boolean }) {
  const navegar = useNavigate();
  const { dados, carregando, erro } = useRecurso<{ pastas: PastaResumo[]; arquivadas: number }>(`/api/carteirinhas/pastas?arquivadas=${arquivadas ? 1 : 0}`);
  const [nova, setNova] = useState(false);

  return (
    <div className="wrap">
      <Cabecalho
        voltar={arquivadas ? { to: '/app/carteirinhas', rotulo: 'Carteirinhas' } : undefined}
        titulo={arquivadas ? 'Pastas arquivadas' : 'Carteirinhas'}
        descricao={arquivadas ? 'Eventos encerrados. Continuam consultáveis e podem ser reabertos.' : 'Pastas de eventos: carteirinhas dos alunos e fichas de inscrição'}
        acoes={arquivadas ? undefined : <>
          {dados?.arquivadas ? <BotaoLink to="/app/carteirinhas/arquivadas" icone="pasta">Arquivadas ({dados.arquivadas})</BotaoLink> : null}
          <Botao variante="primario" icone="mais" onClick={() => setNova(true)}>Nova pasta</Botao>
        </>} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      {carregando && !dados ? <Carregando /> : !dados?.pastas.length ? (
        <EstadoVazio icone="cartao"
          titulo={arquivadas ? 'Nenhuma pasta arquivada' : 'Nenhuma pasta de evento ainda'}
          descricao={arquivadas ? undefined : 'Crie uma pasta para o evento (ex.: Copa Integração 2026), com logo e validade. Dentro dela, uma subpasta para cada turma do evento (Sub 12 Vôlei, Sub 14 Futsal…).'}
          acoes={arquivadas ? undefined : <Botao variante="primario" icone="mais" onClick={() => setNova(true)}>Nova pasta</Botao>} />
      ) : (
        <div className="pastas">
          {dados.pastas.map(p => {
            const logo = urlLogoPasta(p);
            return (
              <Link key={p.id} to={`/app/carteirinhas/${p.id}`} className="pasta-card">
                <div className="pasta-card-cab">
                  <div className="pasta-logo">{logo ? <img src={logo} alt="" /> : <Icone nome="pasta" />}</div>
                  <div style={{ minWidth: 0 }}>
                    <h3>{p.nome}</h3>
                    <span className="cel-sub">{p.subpastas} subpasta(s) · {p.inscritos} aluno(s)</span>
                  </div>
                </div>
                <div className="tags">
                  {p.validade ? <Tag tipo="neutro">válida até {fmtValidade(p.validade)}</Tag> : <Tag tipo="erro" ponto>sem validade</Tag>}
                  {!p.logo_evento_path ? <Tag tipo="erro" ponto>sem logo</Tag> : null}
                  {p.inscritos ? <TagsPendencias c={p} vazioOk={false} /> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ModalPasta aberto={nova} pasta={null} aoFechar={() => setNova(false)} aoSalvar={p => navegar(`/app/carteirinhas/${p.id}`)} />
    </div>
  );
}
