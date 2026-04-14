import { useNavigate } from "react-router-dom";
import ImportForm from "../components/packages/ImportForm";

export default function ImportPage() {
  const navigate = useNavigate();

  return (
    <div className="page import-page">
      <div className="page-header">
        <h2>Importovat balíček</h2>
        <button className="btn btn-secondary" onClick={() => navigate("/")}>
          Zpět
        </button>
      </div>
      <ImportForm onSuccess={() => {}} />
    </div>
  );
}
