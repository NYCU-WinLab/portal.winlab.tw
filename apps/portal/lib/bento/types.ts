export interface MenuItem {
  id: string
  restaurant_id: string
  name: string
  price: number
  type: string | null
  created_at: string
}

export interface Restaurant {
  id: string
  name: string
  phone: string
  google_map_link?: string | null
  additional?: string[] | null
  kind?: "meal" | "drinks"
  menu_image_url?: string | null
  created_at: string
}

export interface OptionValue {
  id: string
  group_id: string
  label: string
  price_delta: number
  sort_order: number
}

export interface OptionGroup {
  id: string
  restaurant_id: string
  name: string
  required: boolean
  single_select: boolean
  sort_order: number
  values: OptionValue[]
}

// A selected option shown on an order item (group name + chosen label).
export interface SelectedOption {
  group_name: string
  label: string
}

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  user_id: string | null
  no_sauce: boolean
  additional: number | null
  anonymous_name?: string | null
  anonymous_contact?: string | null
  menu_items: {
    name: string
    price: number
  }
}

export interface OrderItemWithUser extends OrderItem {
  user: {
    name: string | null
    email?: string
  } | null
  selected_options?: SelectedOption[]
}

export interface Order {
  id: string
  restaurant_id: string
  status: "active" | "closed"
  created_at: string
  closed_at: string | null
  auto_close_at?: string | null
  created_by?: string
  order_date?: string | null
  restaurants: Restaurant
  order_items: OrderItemWithUser[]
}

export interface OrderWithStats {
  id: string
  restaurant_id: string
  status: "active" | "closed"
  created_at: string
  closed_at: string | null
  order_date?: string | null
  restaurants: {
    id?: string
    name: string
    additional?: string[] | null
  }
  order_items?: OrderItem[]
  stats: {
    user_count: number
    menu_item_names: string[]
    menu_items: Array<{ name: string; count: number }>
    total_items: number
    total_price: number
  }
}

export interface UserProfile {
  id: string
  name: string | null
  roles?: {
    bento?: string[]
  }
}
