declare module 'react-native-markdown-display' {
  import { ComponentType } from 'react';
  import { StyleProp, TextStyle, ViewStyle } from 'react-native';

  interface MarkdownStyles {
    // Block styles
    body?: StyleProp<ViewStyle>;
    heading1?: StyleProp<TextStyle>;
    heading2?: StyleProp<TextStyle>;
    heading3?: StyleProp<TextStyle>;
    heading4?: StyleProp<TextStyle>;
    heading5?: StyleProp<TextStyle>;
    heading6?: StyleProp<TextStyle>;
    hr?: StyleProp<ViewStyle>;
    blockquote?: StyleProp<ViewStyle>;
    blockquote_text?: StyleProp<TextStyle>;
    code_block?: StyleProp<ViewStyle>;
    fence?: StyleProp<ViewStyle>;
    paragraph?: StyleProp<TextStyle>;
    bullet_list?: StyleProp<ViewStyle>;
    ordered_list?: StyleProp<ViewStyle>;
    list_item?: StyleProp<ViewStyle>;
    table?: StyleProp<ViewStyle>;
    thead?: StyleProp<ViewStyle>;
    tbody?: StyleProp<ViewStyle>;
    th?: StyleProp<TextStyle>;
    tr?: StyleProp<ViewStyle>;
    td?: StyleProp<TextStyle>;

    // Inline styles
    text?: StyleProp<TextStyle>;
    span?: StyleProp<TextStyle>;
    strong?: StyleProp<TextStyle>;
    em?: StyleProp<TextStyle>;
    s?: StyleProp<TextStyle>;
    link?: StyleProp<TextStyle>;
    code_inline?: StyleProp<TextStyle>;
    image?: StyleProp<ViewStyle>;
    
    // Custom
    [key: string]: StyleProp<ViewStyle | TextStyle> | undefined;
  }

  interface MarkdownProps {
    children?: string;
    style?: MarkdownStyles;
    rules?: Record<string, any>;
    onError?: (error: Error) => void;
    renderer?: Record<string, any>;
    markdownit?: any;
    plugins?: any[];
    useCustomLinkify?: boolean;
    onLinkPress?: (url: string) => boolean;
    allowedImageHandlers?: string[];
    defaultImageHandler?: string;
    mergeStyle?: boolean;
    debugPrintTree?: boolean;
    ignoreHtmlInText?: boolean;
  }

  const Markdown: ComponentType<MarkdownProps>;
  export default Markdown;
} 