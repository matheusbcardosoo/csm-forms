// Foto do aluno com as iniciais como reserva (RF-FOTO-03). A imagem vem
// de GET /api/alunos/:id/foto (sessão por cookie); `versao` entra na URL
// para a troca de foto aparecer sem esperar o cache.
import { useEffect, useState } from 'react';
import { iniciais } from './ui';

export function urlFotoAluno(alunoId: string, versao?: string | null): string {
  return `/api/alunos/${alunoId}/foto${versao ? `?v=${encodeURIComponent(versao)}` : ''}`;
}

export function FotoAluno({ aluno, className = 'ficha-av' }: {
  aluno: { id: string; nome: string; foto_path?: string | null; foto_atualizada_em?: string | null };
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [aluno.foto_path, aluno.foto_atualizada_em]);

  if (!aluno.foto_path || falhou) return <div className={className}>{iniciais(aluno.nome)}</div>;
  return (
    <div className={`${className} com-foto`}>
      <img src={urlFotoAluno(aluno.id, aluno.foto_atualizada_em)} alt={`Foto de ${aluno.nome}`} onError={() => setFalhou(true)} />
    </div>
  );
}
