// Tipos compartilhados entre cliente e servidor (02-arquitetura D4).

export type Papel = 'admin' | 'secretaria' | 'coordenacao' | 'leitura';

export const PAPEIS: Papel[] = ['admin', 'secretaria', 'coordenacao', 'leitura'];

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  secretaria: 'Secretaria',
  coordenacao: 'Coordenação',
  leitura: 'Leitura'
};

export interface Perfil {
  email: string;
  nome: string | null;
  papel: Papel;
  ativo: boolean;
  criado_em?: string;
  ultimo_acesso_em?: string | null;
}

/** Estado de sessão devolvido por GET /api/auth/session. */
export interface EstadoSessao {
  loggedIn: boolean;
  mustChangePassword?: boolean;
  authorized?: boolean;
  perfil?: Perfil | null;
}
