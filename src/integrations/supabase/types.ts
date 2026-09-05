export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      corroboration_items: {
        Row: {
          corroboration_id: string
          created_at: string
          id: string
          item_id: string
          owner_id: string
          project_id: string
        }
        Insert: {
          corroboration_id: string
          created_at?: string
          id?: string
          item_id: string
          owner_id: string
          project_id: string
        }
        Update: {
          corroboration_id?: string
          created_at?: string
          id?: string
          item_id?: string
          owner_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corroboration_items_corroboration_id_fkey"
            columns: ["corroboration_id"]
            isOneToOne: false
            referencedRelation: "corroborations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corroboration_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "drawing_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corroboration_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      corroborations: {
        Row: {
          created_at: string
          drawing_count: number
          drawing_ids: string[]
          fingerprint: string | null
          first_seen_at: string
          group_type: string
          id: string
          item_ids: string[]
          kind: string
          last_seen_at: string
          narrative: string | null
          originator_count: number
          originators: string[]
          owner_id: string
          party_id: string | null
          project_id: string
          resolved_note: string | null
          severity: string | null
          status: string
          summary: string | null
          topic: string
        }
        Insert: {
          created_at?: string
          drawing_count?: number
          drawing_ids?: string[]
          fingerprint?: string | null
          first_seen_at?: string
          group_type?: string
          id?: string
          item_ids?: string[]
          kind?: string
          last_seen_at?: string
          narrative?: string | null
          originator_count?: number
          originators?: string[]
          owner_id: string
          party_id?: string | null
          project_id: string
          resolved_note?: string | null
          severity?: string | null
          status?: string
          summary?: string | null
          topic: string
        }
        Update: {
          created_at?: string
          drawing_count?: number
          drawing_ids?: string[]
          fingerprint?: string | null
          first_seen_at?: string
          group_type?: string
          id?: string
          item_ids?: string[]
          kind?: string
          last_seen_at?: string
          narrative?: string | null
          originator_count?: number
          originators?: string[]
          owner_id?: string
          party_id?: string | null
          project_id?: string
          resolved_note?: string | null
          severity?: string | null
          status?: string
          summary?: string | null
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "corroborations_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corroborations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage: {
        Row: {
          created_at: string
          drawing_id: string
          id: string
          note: string | null
          owner_id: string
          project_id: string
          status: string
          trade_code: string
        }
        Insert: {
          created_at?: string
          drawing_id: string
          id?: string
          note?: string | null
          owner_id: string
          project_id: string
          status?: string
          trade_code: string
        }
        Update: {
          created_at?: string
          drawing_id?: string
          id?: string
          note?: string | null
          owner_id?: string
          project_id?: string
          status?: string
          trade_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_trade_code_fkey"
            columns: ["trade_code"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["code"]
          },
        ]
      }
      deferral_patterns: {
        Row: {
          category: string
          commercial_risk: string | null
          default_severity: string
          id: string
          pattern: string
          recommended_action: string | null
        }
        Insert: {
          category: string
          commercial_risk?: string | null
          default_severity?: string
          id?: string
          pattern: string
          recommended_action?: string | null
        }
        Update: {
          category?: string
          commercial_risk?: string | null
          default_severity?: string
          id?: string
          pattern?: string
          recommended_action?: string | null
        }
        Relationships: []
      }
      disciplines: {
        Row: {
          code: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      drawing_items: {
        Row: {
          allocated_trade_code: string | null
          allocation_method: string | null
          allocation_status: string | null
          also_categories: string[]
          bbox: Json | null
          bbox_frame: string | null
          candidate_trades: Json
          colour: string | null
          commercial_risk: string | null
          confidence: number | null
          corrected_at: string | null
          corrected_by: string | null
          corrected_trade_code: string | null
          correction_note: string | null
          correction_status: string | null
          created_at: string
          deferral_category: string | null
          deferral_pattern_id: string | null
          deferred_to: string | null
          drawing_id: string
          font_size: number | null
          id: string
          interface_guidance: string | null
          interface_rule_id: string | null
          is_red: boolean
          item_type: string
          method: string | null
          owner_id: string
          page_number: number
          party_id: string | null
          project_id: string
          raw_text: string
          recommended_action: string | null
          region: string | null
          severity: string | null
          system_code: string | null
        }
        Insert: {
          allocated_trade_code?: string | null
          allocation_method?: string | null
          allocation_status?: string | null
          also_categories?: string[]
          bbox?: Json | null
          bbox_frame?: string | null
          candidate_trades?: Json
          colour?: string | null
          commercial_risk?: string | null
          confidence?: number | null
          corrected_at?: string | null
          corrected_by?: string | null
          corrected_trade_code?: string | null
          correction_note?: string | null
          correction_status?: string | null
          created_at?: string
          deferral_category?: string | null
          deferral_pattern_id?: string | null
          deferred_to?: string | null
          drawing_id: string
          font_size?: number | null
          id?: string
          interface_guidance?: string | null
          interface_rule_id?: string | null
          is_red?: boolean
          item_type?: string
          method?: string | null
          owner_id: string
          page_number?: number
          party_id?: string | null
          project_id: string
          raw_text: string
          recommended_action?: string | null
          region?: string | null
          severity?: string | null
          system_code?: string | null
        }
        Update: {
          allocated_trade_code?: string | null
          allocation_method?: string | null
          allocation_status?: string | null
          also_categories?: string[]
          bbox?: Json | null
          bbox_frame?: string | null
          candidate_trades?: Json
          colour?: string | null
          commercial_risk?: string | null
          confidence?: number | null
          corrected_at?: string | null
          corrected_by?: string | null
          corrected_trade_code?: string | null
          correction_note?: string | null
          correction_status?: string | null
          created_at?: string
          deferral_category?: string | null
          deferral_pattern_id?: string | null
          deferred_to?: string | null
          drawing_id?: string
          font_size?: number | null
          id?: string
          interface_guidance?: string | null
          interface_rule_id?: string | null
          is_red?: boolean
          item_type?: string
          method?: string | null
          owner_id?: string
          page_number?: number
          party_id?: string | null
          project_id?: string
          raw_text?: string
          recommended_action?: string | null
          region?: string | null
          severity?: string | null
          system_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_items_allocated_trade_code_fkey"
            columns: ["allocated_trade_code"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "drawing_items_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_items_interface_rule_id_fkey"
            columns: ["interface_rule_id"]
            isOneToOne: false
            referencedRelation: "interface_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_items_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawings: {
        Row: {
          analysed_at: string | null
          body_text_count: number | null
          cloned_from_drawing_id: string | null
          coordinate_frame_ok: boolean | null
          created_at: string
          discipline_code: string | null
          drawing_client: string | null
          drawing_date: string | null
          drawing_number: string | null
          drawing_scale: string | null
          drawing_type: string | null
          error_message: string | null
          file_hash: string
          file_name: string
          id: string
          issue_status: string | null
          layers_present: string[] | null
          notes_strip_source: string | null
          originator: string | null
          owner_id: string
          page_height: number | null
          page_rotation: number | null
          page_width: number | null
          path_count: number | null
          project_id: string
          revision: string | null
          status: string
          storage_path: string
          text_span_count: number | null
          title: string | null
          triage_class: string | null
        }
        Insert: {
          analysed_at?: string | null
          body_text_count?: number | null
          cloned_from_drawing_id?: string | null
          coordinate_frame_ok?: boolean | null
          created_at?: string
          discipline_code?: string | null
          drawing_client?: string | null
          drawing_date?: string | null
          drawing_number?: string | null
          drawing_scale?: string | null
          drawing_type?: string | null
          error_message?: string | null
          file_hash: string
          file_name: string
          id?: string
          issue_status?: string | null
          layers_present?: string[] | null
          notes_strip_source?: string | null
          originator?: string | null
          owner_id: string
          page_height?: number | null
          page_rotation?: number | null
          page_width?: number | null
          path_count?: number | null
          project_id: string
          revision?: string | null
          status?: string
          storage_path: string
          text_span_count?: number | null
          title?: string | null
          triage_class?: string | null
        }
        Update: {
          analysed_at?: string | null
          body_text_count?: number | null
          cloned_from_drawing_id?: string | null
          coordinate_frame_ok?: boolean | null
          created_at?: string
          discipline_code?: string | null
          drawing_client?: string | null
          drawing_date?: string | null
          drawing_number?: string | null
          drawing_scale?: string | null
          drawing_type?: string | null
          error_message?: string | null
          file_hash?: string
          file_name?: string
          id?: string
          issue_status?: string | null
          layers_present?: string[] | null
          notes_strip_source?: string | null
          originator?: string | null
          owner_id?: string
          page_height?: number | null
          page_rotation?: number | null
          page_width?: number | null
          path_count?: number | null
          project_id?: string
          revision?: string | null
          status?: string
          storage_path?: string
          text_span_count?: number | null
          title?: string | null
          triage_class?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawings_cloned_from_drawing_id_fkey"
            columns: ["cloned_from_drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      interface_rules: {
        Row: {
          context_terms: string[]
          guidance: string | null
          id: string
          name: string | null
          note: string | null
          severity: string
          topic: string | null
          trade_a: string | null
          trade_b: string | null
          trade_codes: string[]
          trigger_terms: string[]
        }
        Insert: {
          context_terms?: string[]
          guidance?: string | null
          id?: string
          name?: string | null
          note?: string | null
          severity?: string
          topic?: string | null
          trade_a?: string | null
          trade_b?: string | null
          trade_codes?: string[]
          trigger_terms?: string[]
        }
        Update: {
          context_terms?: string[]
          guidance?: string | null
          id?: string
          name?: string | null
          note?: string | null
          severity?: string
          topic?: string | null
          trade_a?: string | null
          trade_b?: string | null
          trade_codes?: string[]
          trigger_terms?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "interface_rules_trade_a_fkey"
            columns: ["trade_a"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "interface_rules_trade_b_fkey"
            columns: ["trade_b"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["code"]
          },
        ]
      }
      parties: {
        Row: {
          appointed_note: string | null
          appointed_status: string
          canonical_name: string
          created_at: string
          id: string
          merged_into_party_id: string | null
          needs_review: boolean
          normalised_name: string
          owner_id: string
          party_type: string
          project_id: string
          review_reason: string | null
        }
        Insert: {
          appointed_note?: string | null
          appointed_status?: string
          canonical_name: string
          created_at?: string
          id?: string
          merged_into_party_id?: string | null
          needs_review?: boolean
          normalised_name: string
          owner_id: string
          party_type?: string
          project_id: string
          review_reason?: string | null
        }
        Update: {
          appointed_note?: string | null
          appointed_status?: string
          canonical_name?: string
          created_at?: string
          id?: string
          merged_into_party_id?: string | null
          needs_review?: boolean
          normalised_name?: string
          owner_id?: string
          party_type?: string
          project_id?: string
          review_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parties_merged_into_party_id_fkey"
            columns: ["merged_into_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      party_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          normalised_alias: string
          owner_id: string
          party_id: string
          project_id: string
          source: string | null
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          normalised_alias: string
          owner_id: string
          party_id: string
          project_id: string
          source?: string | null
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          normalised_alias?: string
          owner_id?: string
          party_id?: string
          project_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_aliases_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_aliases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          project_reference: string | null
        }
        Insert: {
          client?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          project_reference?: string | null
        }
        Update: {
          client?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          project_reference?: string | null
        }
        Relationships: []
      }
      system_code_prefixes: {
        Row: {
          confidence: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          prefix: string
          project_id: string | null
          scope: string
          trade_code: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          prefix: string
          project_id?: string | null
          scope?: string
          trade_code?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          prefix?: string
          project_id?: string | null
          scope?: string
          trade_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_code_prefixes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_code_prefixes_trade_code_fkey"
            columns: ["trade_code"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["code"]
          },
        ]
      }
      trade_cues: {
        Row: {
          cue: string
          cue_type: string
          id: string
          trade_code: string
          weight: number
        }
        Insert: {
          cue: string
          cue_type?: string
          id?: string
          trade_code: string
          weight?: number
        }
        Update: {
          cue?: string
          cue_type?: string
          id?: string
          trade_code?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "trade_cues_trade_code_fkey"
            columns: ["trade_code"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["code"]
          },
        ]
      }
      trades: {
        Row: {
          code: string
          discipline_code: string | null
          name: string
          sort_order: number
          typical_drawing_types: string[]
        }
        Insert: {
          code: string
          discipline_code?: string | null
          name: string
          sort_order?: number
          typical_drawing_types?: string[]
        }
        Update: {
          code?: string
          discipline_code?: string | null
          name?: string
          sort_order?: number
          typical_drawing_types?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "trades_discipline_code_fkey"
            columns: ["discipline_code"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
