// Tipos compartilhados entre cliente e servidor (02-arquitetura D4).

export type Papel = 'admin' | 'secretaria' | 'coordenacao' | 'leitura';

export const PAPEIS: Papel[] = ['admin', 'secretaria', 'coordenacao', 'leitura'];

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  secretaria: 'Secretaria',
  coordenacao: 'Coordenação',
  leitura: 'Leitura'
};

/** O que cada papel pode fazer — tela de usuários e cartilha de primeiro acesso. */
export const DESCRICAO_PAPEL: Record<Papel, string> = {
  admin: 'Tudo, incluindo configuração da instituição, currículos e usuários',
  secretaria: 'Importa, edita notas, gera e emite históricos, vê formulários e cadastra a equipe',
  coordenacao: 'Consulta alunos, notas e históricos; não emite nem edita nota',
  leitura: 'Somente consulta'
};

export interface Perfil {
  email: string;
  nome: string | null;
  papel: Papel;
  ativo: boolean;
  criado_em?: string;
  ultimo_acesso_em?: string | null;
}

/** Linha da tela de equipe: o perfil e a situação da conta de login. */
export interface PerfilEquipe extends Perfil {
  tem_login: boolean;
  /** Conta criada, senha provisória ainda não trocada. */
  primeiro_acesso_pendente: boolean;
}

/** Resposta de cadastro / nova senha provisória — a senha vem uma vez só. */
export interface AcessoCriado {
  perfil: Perfil;
  senha_provisoria: string;
}

/** Estado de sessão devolvido por GET /api/auth/session. */
export interface EstadoSessao {
  loggedIn: boolean;
  mustChangePassword?: boolean;
  authorized?: boolean;
  perfil?: Perfil | null;
}
