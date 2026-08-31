export default function Modal({ title, wide, children, onClose, foot }) {
  return (
    <div className="modal-bg" onClick={(e) => e.target.classList.contains("modal-bg") && onClose?.()}>
      <div className={"modal" + (wide ? " wide" : "")}>
        <h3>{title}</h3>
        <div className="m-body">{children}</div>
        {foot && <div className="m-foot">{foot}</div>}
      </div>
    </div>
  );
}
