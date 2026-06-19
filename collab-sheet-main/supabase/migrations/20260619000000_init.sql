-- Supabase Migration: 20260619000000_init.sql
-- Create database schema and Row-Level Security (RLS) policies for CollabSheet.

-- 1. PROFILES Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. DOCUMENTS Table
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Untitled spreadsheet',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 3. DOCUMENT_COLLABORATORS Table
CREATE TABLE IF NOT EXISTS public.document_collaborators (
  doc_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  PRIMARY KEY (doc_id, user_id)
);

-- Enable RLS on document_collaborators
ALTER TABLE public.document_collaborators ENABLE ROW LEVEL SECURITY;

-- 4. CELLS Table
CREATE TABLE IF NOT EXISTS public.cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  cell_key TEXT NOT NULL,
  value TEXT,
  formula TEXT,
  bold BOOLEAN NOT NULL DEFAULT false,
  italic BOOLEAN NOT NULL DEFAULT false,
  align TEXT NOT NULL DEFAULT 'left',
  font_size INTEGER NOT NULL DEFAULT 12,
  bg_color TEXT DEFAULT NULL,
  border TEXT DEFAULT NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doc_id, cell_key)
);

-- Enable RLS on cells
ALTER TABLE public.cells ENABLE ROW LEVEL SECURITY;

-- 5. Helper function for RLS to check collaborator status without recursion
CREATE OR REPLACE FUNCTION public.is_collaborator(check_doc_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.documents 
    WHERE public.documents.id = check_doc_id 
      AND public.documents.owner_id = check_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.document_collaborators 
    WHERE public.document_collaborators.doc_id = check_doc_id 
      AND public.document_collaborators.user_id = check_user_id
  );
END;
$$;

-- 6. RLS POLICIES

-- Profiles policies
CREATE POLICY "Enable read access for all users" ON public.profiles
  FOR SELECT
  USING (true);

CREATE POLICY "Enable insert for users own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = profiles.id);

CREATE POLICY "Enable update for users own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = profiles.id)
  WITH CHECK (auth.uid() = profiles.id);

-- Documents policies
CREATE POLICY "Enable select for owners and collaborators" ON public.documents
  FOR SELECT
  USING (public.is_collaborator(documents.id, auth.uid()));

CREATE POLICY "Enable insert for authenticated and anonymous users" ON public.documents
  FOR INSERT
  WITH CHECK (auth.uid() = documents.owner_id);

CREATE POLICY "Enable update for owners and editors" ON public.documents
  FOR UPDATE
  USING (
    documents.owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.document_collaborators 
      WHERE document_collaborators.doc_id = documents.id 
        AND document_collaborators.user_id = auth.uid() 
        AND document_collaborators.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Enable delete for owners only" ON public.documents
  FOR DELETE
  USING (documents.owner_id = auth.uid());

-- Document Collaborators policies
CREATE POLICY "Enable select for document collaborators" ON public.document_collaborators
  FOR SELECT
  USING (public.is_collaborator(document_collaborators.doc_id, auth.uid()));

CREATE POLICY "Enable all modifications for document owners only" ON public.document_collaborators
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE documents.id = document_collaborators.doc_id 
        AND documents.owner_id = auth.uid()
    )
  );

-- Cells policies
CREATE POLICY "Enable select for cells of shared documents" ON public.cells
  FOR SELECT
  USING (public.is_collaborator(cells.doc_id, auth.uid()));

CREATE POLICY "Enable insert for cell editors" ON public.cells
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE documents.id = cells.doc_id 
        AND documents.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.document_collaborators 
      WHERE document_collaborators.doc_id = cells.doc_id 
        AND document_collaborators.user_id = auth.uid() 
        AND document_collaborators.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Enable update for cell editors" ON public.cells
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE documents.id = cells.doc_id 
        AND documents.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.document_collaborators 
      WHERE document_collaborators.doc_id = cells.doc_id 
        AND document_collaborators.user_id = auth.uid() 
        AND document_collaborators.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Enable delete for cell editors" ON public.cells
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE documents.id = cells.doc_id 
        AND documents.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.document_collaborators 
      WHERE document_collaborators.doc_id = cells.doc_id 
        AND document_collaborators.user_id = auth.uid() 
        AND document_collaborators.role IN ('owner', 'editor')
    )
  );
