export default function Toast({ message, visible }) {
  return (
    <div style={{
      position:"fixed",
      bottom:"var(--nav-float-bottom)",
      left:"50%",
      transform:`translateX(-50%) translateY(${visible?0:16}px)`,
      zIndex:500,
      background:"#1B6E62",
      color:"#fff",
      borderRadius:14,
      padding:"12px 20px",
      fontFamily:"'Space Grotesk',-apple-system,BlinkMacSystemFont,sans-serif",
      fontWeight:700,
      fontSize:14,
      boxShadow:"0 8px 24px rgba(0,0,0,0.2)",
      transition:"opacity 0.3s ease, transform 0.3s ease",
      opacity:visible?1:0,
      pointerEvents:visible?"auto":"none",
      whiteSpace:"nowrap",
    }}>
      {message}
    </div>
  );
}
