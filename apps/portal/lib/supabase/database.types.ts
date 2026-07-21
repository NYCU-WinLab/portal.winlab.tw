export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          notified_at: string | null
          pinned: boolean
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          notified_at?: string | null
          pinned?: boolean
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          notified_at?: string | null
          pinned?: boolean
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approve_documents: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          file_path: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          file_path?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          file_path?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approve_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approve_email_outbox: {
        Row: {
          attempts: number
          created_at: string
          document_id: string
          id: string
          kind: string
          last_error: string | null
          recipient_id: string
          sent_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          document_id: string
          id?: string
          kind: string
          last_error?: string | null
          recipient_id: string
          sent_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          document_id?: string
          id?: string
          kind?: string
          last_error?: string | null
          recipient_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approve_email_outbox_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "approve_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approve_email_outbox_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approve_fields: {
        Row: {
          category: string
          created_at: string
          document_id: string
          height: number
          id: string
          label: string | null
          page: number
          signed_at: string | null
          signer_id: string | null
          value: string | null
          width: number
          x: number
          y: number
        }
        Insert: {
          category: string
          created_at?: string
          document_id: string
          height: number
          id?: string
          label?: string | null
          page: number
          signed_at?: string | null
          signer_id?: string | null
          value?: string | null
          width: number
          x: number
          y: number
        }
        Update: {
          category?: string
          created_at?: string
          document_id?: string
          height?: number
          id?: string
          label?: string | null
          page?: number
          signed_at?: string | null
          signer_id?: string | null
          value?: string | null
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "approve_fields_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "approve_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approve_fields_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approve_signers: {
        Row: {
          created_at: string
          document_id: string
          id: string
          signed_at: string | null
          signer_id: string
          status: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          signed_at?: string | null
          signer_id: string
          status?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          signed_at?: string | null
          signer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approve_signers_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "approve_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approve_signers_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approve_user_field_values: {
        Row: {
          category: string
          id: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          category: string
          id?: string
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          category?: string
          id?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "approve_user_field_values_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bento_menu_items: {
        Row: {
          created_at: string | null
          id: string
          name: string
          options: Json | null
          price: number
          restaurant_id: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          options?: Json | null
          price: number
          restaurant_id: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          options?: Json | null
          price?: number
          restaurant_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bento_menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "bento_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      bento_menus: {
        Row: {
          additional: Json | null
          created_at: string | null
          google_map_link: string | null
          id: string
          is_active: boolean
          kind: string
          menu_image_url: string | null
          name: string
          phone: string
          updated_at: string | null
        }
        Insert: {
          additional?: Json | null
          created_at?: string | null
          google_map_link?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          menu_image_url?: string | null
          name: string
          phone: string
          updated_at?: string | null
        }
        Update: {
          additional?: Json | null
          created_at?: string | null
          google_map_link?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          menu_image_url?: string | null
          name?: string
          phone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      bento_option_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          required: boolean
          restaurant_id: string
          single_select: boolean
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          required?: boolean
          restaurant_id: string
          single_select?: boolean
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          required?: boolean
          restaurant_id?: string
          single_select?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bento_option_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "bento_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      bento_option_values: {
        Row: {
          group_id: string
          id: string
          label: string
          price_delta: number
          sort_order: number
        }
        Insert: {
          group_id: string
          id?: string
          label: string
          price_delta?: number
          sort_order?: number
        }
        Update: {
          group_id?: string
          id?: string
          label?: string
          price_delta?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bento_option_values_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "bento_option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      bento_order_item_options: {
        Row: {
          option_value_id: string
          order_item_id: string
        }
        Insert: {
          option_value_id: string
          order_item_id: string
        }
        Update: {
          option_value_id?: string
          order_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bento_order_item_options_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "bento_option_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bento_order_item_options_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "bento_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bento_order_items: {
        Row: {
          additional: number | null
          anonymous_contact: string | null
          anonymous_name: string | null
          created_at: string | null
          id: string
          menu_item_id: string
          no_sauce: boolean | null
          order_id: string
          user_id: string | null
        }
        Insert: {
          additional?: number | null
          anonymous_contact?: string | null
          anonymous_name?: string | null
          created_at?: string | null
          id?: string
          menu_item_id: string
          no_sauce?: boolean | null
          order_id: string
          user_id?: string | null
        }
        Update: {
          additional?: number | null
          anonymous_contact?: string | null
          anonymous_name?: string | null
          created_at?: string | null
          id?: string
          menu_item_id?: string
          no_sauce?: boolean | null
          order_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bento_order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "bento_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bento_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "bento_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bento_order_items_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bento_orders: {
        Row: {
          auto_close_at: string | null
          closed_at: string | null
          created_at: string | null
          created_by: string
          id: string
          order_date: string
          restaurant_id: string
          status: string
        }
        Insert: {
          auto_close_at?: string | null
          closed_at?: string | null
          created_at?: string | null
          created_by: string
          id: string
          order_date: string
          restaurant_id: string
          status?: string
        }
        Update: {
          auto_close_at?: string | null
          closed_at?: string | null
          created_at?: string | null
          created_by?: string
          id?: string
          order_date?: string
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bento_orders_created_by_profile_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bento_orders_new_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "bento_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      bento_ratings: {
        Row: {
          created_at: string | null
          id: string
          menu_item_id: string
          score: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          menu_item_id: string
          score: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          menu_item_id?: string
          score?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bento_ratings_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "bento_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bento_ratings_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_message_mentions: {
        Row: {
          mentioned_user_id: string
          message_id: string
          notified_at: string | null
        }
        Insert: {
          mentioned_user_id: string
          message_id: string
          notified_at?: string | null
        }
        Update: {
          mentioned_user_id?: string
          message_id?: string
          notified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_message_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_message_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "bulletin_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_messages: {
        Row: {
          author_id: string
          broadcast_notified_at: string | null
          content: string
          created_at: string
          id: string
          is_broadcast: boolean
        }
        Insert: {
          author_id: string
          broadcast_notified_at?: string | null
          content: string
          created_at?: string
          id?: string
          is_broadcast?: boolean
        }
        Update: {
          author_id?: string
          broadcast_notified_at?: string | null
          content?: string
          created_at?: string
          id?: string
          is_broadcast?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_activity_notifications: {
        Row: {
          actor_user_id: string
          body: string | null
          comment_id: string | null
          created_at: string
          id: string
          image_id: string
          kind: string
          reaction: string | null
          read_at: string | null
          recipient_user_id: string
        }
        Insert: {
          actor_user_id: string
          body?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          image_id: string
          kind: string
          reaction?: string | null
          read_at?: string | null
          recipient_user_id: string
        }
        Update: {
          actor_user_id?: string
          body?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          image_id?: string
          kind?: string
          reaction?: string | null
          read_at?: string | null
          recipient_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_activity_notifications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_activity_notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "gallery_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_activity_notifications_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "gallery_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_activity_notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "gallery_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_comment_mentions: {
        Row: {
          comment_id: string
          mentioned_user_id: string
          notified_at: string | null
          read_at: string | null
        }
        Insert: {
          comment_id: string
          mentioned_user_id: string
          notified_at?: string | null
          read_at?: string | null
        }
        Update: {
          comment_id?: string
          mentioned_user_id?: string
          notified_at?: string | null
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "gallery_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_comments: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          image_id: string
          parent_id: string | null
          pinned_at: string | null
          updated_at: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          image_id: string
          parent_id?: string | null
          pinned_at?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          image_id?: string
          parent_id?: string | null
          pinned_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_comments_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "gallery_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "gallery_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_image_votes: {
        Row: {
          created_at: string
          image_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          image_id: string
          reaction?: string
          user_id: string
        }
        Update: {
          created_at?: string
          image_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_image_votes_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "gallery_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_image_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_images: {
        Row: {
          created_at: string
          created_by: string
          duration_seconds: number | null
          id: string
          image_path: string
          media_type: string
          name: string
          pinned_at: string | null
          poster_path: string | null
          sequence_id: string | null
          sequence_index: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          duration_seconds?: number | null
          id?: string
          image_path: string
          media_type?: string
          name: string
          pinned_at?: string | null
          poster_path?: string | null
          sequence_id?: string | null
          sequence_index?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          duration_seconds?: number | null
          id?: string
          image_path?: string
          media_type?: string
          name?: string
          pinned_at?: string | null
          poster_path?: string | null
          sequence_id?: string | null
          sequence_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_images_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "gallery_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_scores: {
        Row: {
          created_at: string
          finish_time_ms: number
          game_type: Database["public"]["Enums"]["game_type"]
          id: string
          level: number | null
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          finish_time_ms: number
          game_type: Database["public"]["Enums"]["game_type"]
          id?: string
          level?: number | null
          score: number
          user_id: string
        }
        Update: {
          created_at?: string
          finish_time_ms?: number
          game_type?: Database["public"]["Enums"]["game_type"]
          id?: string
          level?: number | null
          score?: number
          user_id?: string
        }
        Relationships: []
      }
      leaves: {
        Row: {
          created_at: string | null
          date: string
          id: string
          reason: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          reason: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          reason?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      meeting_groups: {
        Row: {
          group_number: number
          members: string[]
          updated_at: string
        }
        Insert: {
          group_number: number
          members?: string[]
          updated_at?: string
        }
        Update: {
          group_number?: number
          members?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      meeting_question_pool: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_question_pool_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_questioners: {
        Row: {
          assigned_at: string
          meeting_id: string
          source: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          meeting_id: string
          source: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          meeting_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_questioners_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_questioners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          created_at: string
          id: string
          is_holiday: boolean
          location: string
          notes: string | null
          paper_link: string | null
          paper_title: string | null
          ppt_link: string | null
          ppt_uploaded: boolean
          presenter: string | null
          presenter_user_id: string | null
          question_group_number: number | null
          scheduled_date: string
          start_time: string
          teacher_paper_id: string | null
          video_link: string | null
          video_uploaded: boolean
          week_label: string | null
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_holiday?: boolean
          location?: string
          notes?: string | null
          paper_link?: string | null
          paper_title?: string | null
          ppt_link?: string | null
          ppt_uploaded?: boolean
          presenter?: string | null
          presenter_user_id?: string | null
          question_group_number?: number | null
          scheduled_date: string
          start_time?: string
          teacher_paper_id?: string | null
          video_link?: string | null
          video_uploaded?: boolean
          week_label?: string | null
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          is_holiday?: boolean
          location?: string
          notes?: string | null
          paper_link?: string | null
          paper_title?: string | null
          ppt_link?: string | null
          ppt_uploaded?: boolean
          presenter?: string | null
          presenter_user_id?: string | null
          question_group_number?: number | null
          scheduled_date?: string
          start_time?: string
          teacher_paper_id?: string | null
          video_link?: string | null
          video_uploaded?: boolean
          week_label?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_meeting_question_group"
            columns: ["question_group_number"]
            isOneToOne: false
            referencedRelation: "meeting_groups"
            referencedColumns: ["group_number"]
          },
          {
            foreignKeyName: "meetings_presenter_user_id_fkey"
            columns: ["presenter_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_teacher_paper_id_fkey"
            columns: ["teacher_paper_id"]
            isOneToOne: false
            referencedRelation: "teacher_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          github: string | null
          id: string
          is_active: boolean | null
          joined_year: number | null
          name: string
          name_en: string | null
          office: string | null
          phone: string | null
          research_areas: string[] | null
          role: string
          student_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          github?: string | null
          id?: string
          is_active?: boolean | null
          joined_year?: number | null
          name: string
          name_en?: string | null
          office?: string | null
          phone?: string | null
          research_areas?: string[] | null
          role: string
          student_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          github?: string | null
          id?: string
          is_active?: boolean | null
          joined_year?: number | null
          name?: string
          name_en?: string | null
          office?: string | null
          phone?: string | null
          research_areas?: string[] | null
          role?: string
          student_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notepads: {
        Row: {
          content: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      receipt_tag_assignments: {
        Row: {
          created_at: string
          receipt_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          receipt_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          receipt_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_tag_assignments_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "receipt_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          variant: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          variant?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          created_by: string | null
          deposit_account: string | null
          id: string
          image_path: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deposit_account?: string | null
          id?: string
          image_path: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deposit_account?: string | null
          id?: string
          image_path?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts_email_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          receipt_id: string
          sent_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          receipt_id: string
          sent_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          receipt_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_email_outbox_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      reimburse_egress: {
        Row: {
          applicant_name: string
          created_at: string
          id: string
          invoice_date: string
          invoice_files: string[]
          item_amount: number
          item_comment: string | null
          item_name: string
          status: string
          transfer_date: string | null
          transfer_fee: number | null
          transfer_files: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          applicant_name: string
          created_at?: string
          id?: string
          invoice_date: string
          invoice_files?: string[]
          item_amount: number
          item_comment?: string | null
          item_name: string
          status?: string
          transfer_date?: string | null
          transfer_fee?: number | null
          transfer_files?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          applicant_name?: string
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_files?: string[]
          item_amount?: number
          item_comment?: string | null
          item_name?: string
          status?: string
          transfer_date?: string | null
          transfer_fee?: number | null
          transfer_files?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reimburse_egress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reimburse_ingress: {
        Row: {
          created_at: string
          id: string
          ingress_amount: number
          ingress_comment: string | null
          ingress_date: string
          ingress_files: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ingress_amount: number
          ingress_comment?: string | null
          ingress_date: string
          ingress_files?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ingress_amount?: number
          ingress_comment?: string | null
          ingress_date?: string
          ingress_files?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reimburse_ingress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_paper_tags: {
        Row: {
          created_at: string
          tag_id: string
          teacher_paper_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          teacher_paper_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          teacher_paper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_paper_tags_teacher_paper_id_fkey"
            columns: ["teacher_paper_id"]
            isOneToOne: false
            referencedRelation: "teacher_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_paper_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "meeting_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_papers: {
        Row: {
          created_at: string
          file_link: string | null
          id: string
          paper_name: string
          provided_date: string
          source: string | null
        }
        Insert: {
          created_at?: string
          file_link?: string | null
          id?: string
          paper_name: string
          provided_date: string
          source?: string | null
        }
        Update: {
          created_at?: string
          file_link?: string | null
          id?: string
          paper_name?: string
          provided_date?: string
          source?: string | null
        }
        Relationships: []
      }
      trip_files: {
        Row: {
          created_at: string
          description: string | null
          filename: string
          id: string
          size_bytes: number | null
          storage_path: string
          trip_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          filename: string
          id?: string
          size_bytes?: number | null
          storage_path: string
          trip_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          filename?: string
          id?: string
          size_bytes?: number | null
          storage_path?: string
          trip_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_files_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_files_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          active_workflow: Json | null
          claude_session_id: string | null
          created_at: string | null
          discord_user_id: string | null
          email: string | null
          id: string
          is_admin: boolean | null
          last_active_platform: string | null
          line_user_id: string | null
          name: string | null
          roles: Json | null
          telegram_user_id: string | null
        }
        Insert: {
          active_workflow?: Json | null
          claude_session_id?: string | null
          created_at?: string | null
          discord_user_id?: string | null
          email?: string | null
          id: string
          is_admin?: boolean | null
          last_active_platform?: string | null
          line_user_id?: string | null
          name?: string | null
          roles?: Json | null
          telegram_user_id?: string | null
        }
        Update: {
          active_workflow?: Json | null
          claude_session_id?: string | null
          created_at?: string | null
          discord_user_id?: string | null
          email?: string | null
          id?: string
          is_admin?: boolean | null
          last_active_platform?: string | null
          line_user_id?: string | null
          name?: string | null
          roles?: Json | null
          telegram_user_id?: string | null
        }
        Relationships: []
      }
      user_sign_prefs: {
        Row: {
          corner: string
          enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          corner?: string
          enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          corner?: string
          enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sign_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      meeting_question_rotation: {
        Row: {
          email: string | null
          last_asked_date: string | null
          name: string | null
          pool_added_at: string | null
          times_asked: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_question_pool_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_bento_order_item: {
        Args: {
          p_anonymous_contact?: string
          p_anonymous_name?: string
          p_menu_item_id: string
          p_no_sauce?: boolean
          p_option_value_ids?: string[]
          p_order_id: string
          p_user_id?: string
        }
        Returns: {
          additional: number | null
          anonymous_contact: string | null
          anonymous_name: string | null
          created_at: string | null
          id: string
          menu_item_id: string
          no_sauce: boolean | null
          order_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bento_order_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_doc_status: { Args: { doc_id: string }; Returns: string }
      approve_is_creator: {
        Args: { doc_id: string; uid: string }
        Returns: boolean
      }
      approve_is_signer: {
        Args: { doc_id: string; uid: string }
        Returns: boolean
      }
      approve_profile_stats: { Args: { p_user_id: string }; Returns: Json }
      approve_submit_signature: {
        Args: { p_document_id: string; p_values: Json }
        Returns: undefined
      }
      bento_profile_stats: { Args: { p_user_id: string }; Returns: Json }
      create_bento_order: {
        Args: {
          p_auto_close_at?: string
          p_order_date: string
          p_restaurant_id: string
        }
        Returns: {
          auto_close_at: string | null
          closed_at: string | null
          created_at: string | null
          created_by: string
          id: string
          order_date: string
          restaurant_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "bento_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gallery_admin_set_comment_pin: {
        Args: { p_comment_id: string; p_pinned: boolean }
        Returns: undefined
      }
      gallery_admin_set_image_pin: {
        Args: { p_image_id: string; p_pinned: boolean }
        Returns: undefined
      }
      gallery_wall_cover_rank: { Args: { p_image_id: string }; Returns: number }
      get_game_leaderboard: {
        Args: {
          p_game_type: Database["public"]["Enums"]["game_type"]
          p_level?: number
        }
        Returns: {
          achieved_at: string
          finish_time_ms: number
          score: number
          user_id: string
          user_name: string
        }[]
      }
      get_profile_stats: { Args: { p_user_id: string }; Returns: Json }
      get_user_email: { Args: never; Returns: string }
      has_role: {
        Args: { role_name: string; system_name: string; user_id_param: string }
        Returns: boolean
      }
      is_meetings_admin: { Args: never; Returns: boolean }
      is_portal_admin: { Args: never; Returns: boolean }
      is_receipts_admin: { Args: never; Returns: boolean }
      is_reimburse_admin: { Args: never; Returns: boolean }
      is_trip_admin: { Args: never; Returns: boolean }
      leave_profile_stats: { Args: { p_user_id: string }; Returns: Json }
      meetings_claim: { Args: { p_meeting_id: string }; Returns: undefined }
      meetings_insert_week: {
        Args: { p_at_meeting_id: string }
        Returns: string
      }
      meetings_remove_from_pool: {
        Args: { p_user: string }
        Returns: undefined
      }
      meetings_remove_week: {
        Args: { p_at_meeting_id: string }
        Returns: undefined
      }
      meetings_replace_questioner: {
        Args: {
          p_meeting_id: string
          p_remove_user: string
          p_replacement?: string
        }
        Returns: undefined
      }
      meetings_swap: { Args: { p_a: string; p_b: string }; Returns: undefined }
      meetings_sync_questioners: {
        Args: { p_meeting_id: string }
        Returns: undefined
      }
      portal_admin_get_users: {
        Args: never
        Returns: {
          email: string
          id: string
          is_admin: boolean
          name: string
          roles: Json
        }[]
      }
      portal_admin_update_user: {
        Args: { p_is_admin: boolean; p_roles: Json; p_target_id: string }
        Returns: undefined
      }
      submit_game_score: {
        Args: {
          p_finish_ms: number
          p_game_type: Database["public"]["Enums"]["game_type"]
          p_level?: number
          p_score: number
        }
        Returns: undefined
      }
      trip_admin_get_member_signatures: {
        Args: { p_trip_id: string }
        Returns: {
          corner: string
          enabled: boolean
          member_id: string
          signature: string
        }[]
      }
      trip_profile_stats: { Args: { p_user_id: string }; Returns: Json }
      upsert_user_profile: {
        Args: { p_email: string; p_name: string }
        Returns: string
      }
    }
    Enums: {
      egress_status: "pending" | "approved" | "rejected" | "transferred"
      game_type:
        | "2048"
        | "memory"
        | "typing"
        | "snake"
        | "pipes"
        | "kings"
        | "queens"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      egress_status: ["pending", "approved", "rejected", "transferred"],
      game_type: [
        "2048",
        "memory",
        "typing",
        "snake",
        "pipes",
        "kings",
        "queens",
      ],
    },
  },
} as const
